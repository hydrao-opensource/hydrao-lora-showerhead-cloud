const fs = require("fs");
const csv = require("csv-parser");
const axios = require("axios");

const CHIRPSTACK_URL = process.env.CHIRPSTACK_URL || "http://chirpstack:8080";
const API_TOKEN = process.env.CHIRPSTACK_API_TOKEN;

const api = axios.create({
  baseURL: `${CHIRPSTACK_URL}/api`,
  headers: { "Grpc-Metadata-Authorization": `Bearer ${API_TOKEN}` },
});

async function getTenantId() {
  const resp = await api.get("/tenants?limit=1");
  if (!resp.data.result || resp.data.result.length === 0)
    throw Error("Aucun Tenant trouvé !");
  return resp.data.result[0].id;
}

function parseTags(tagsString) {
  const tagsObj = {};
  if (!tagsString) return tagsObj;
  tagsString.split(";").forEach((pair) => {
    const [key, value] = pair.split(":");
    if (key && value) tagsObj[key.trim()] = value.trim();
  });
  return tagsObj;
}

function sanitizeHex(hexString, expectedLength) {
  // 1. Remplace les 'O' (lettre) par des '0' (chiffre) au cas où
  let clean = hexString.toUpperCase().replace(/O/g, "0");

  // 2. Supprime tout ce qui n'est pas 0-9 ou A-F
  clean = clean.replace(/[^0-9A-F]/g, "");

  if (clean.length !== expectedLength) {
    throw new Error(
      `Format invalide : attendu ${expectedLength} caractères hex, reçu ${clean.length} (${clean})`,
    );
  }

  return clean.toLowerCase();
}

function formatMacVersion(v) {
  // Transforme "1.0.1" en "LORAWAN_1_0_1"
  if (!v) return "LORAWAN_1_0_3"; // Valeur par défaut prudente
  const formatted = "LORAWAN_" + v.replace(/\./g, "_");
  return formatted;
}

async function getOrCreateDeviceProfile(tenantId, profileName) {
  const profResp = await api.get(
    `/device-profiles?tenantId=${tenantId}&limit=100`,
  );
  const existingProfile = profResp.data.result?.find(
    (p) => p.name === profileName,
  );

  if (existingProfile) {
    console.log(`ℹ️ Device Profil "${profileName}" existe déjà`);
    return existingProfile.id; // On retourne directement l'ID
  }

  // Chargement des specs depuis le CSV des profils
  const profiles = [];
  const stream = fs
    .createReadStream("device-profiles.csv")
    .pipe(csv({ separator: ";" }));
  for await (const row of stream) {
    profiles.push(row);
  }

  const spec = profiles.find((p) => p.name === profileName);
  if (!spec)
    throw Error(
      `Le profil ${profileName} n'existe pas dans device-profiles.csv`,
    );

  console.log(
    `🆕 Création du device profil : ${profileName} (data: ${JSON.stringify(spec)})`,
  );
  const newProfile = await api.post("/device-profiles", {
    deviceProfile: {
      name: profileName,
      tenantId: tenantId,
      description: spec.description,
      region: spec.region || "US915",
      macVersion: formatMacVersion(spec.macVersion || "1.0.3"),
      regParamsRevision: spec.regParamsRevision || "A",
      adrAlgorithmId: "default",
      uplinkInterval: parseInt(spec.uplinkInterval) || 3600,
      // Paramètre Max EIRP
      maxEirp: parseInt(spec.maxEirp) || 16,
      supportsOtaa: spec.supportsOtaa === "1",
      supportsClassB: spec.supportsClassB === "1",
      supportsClassC: spec.supportsClassC === "1",
    },
  });

  return newProfile.data.id;
}

async function setDeviceKeys(devEui, appKey, networkKey) {
  const deviceKeys = networkKey
    ? {
        appKey: sanitizeHex(appKey, 32).toLowerCase(),
        nwkKey: sanitizeHex(networkKey, 32).toLowerCase(),
      }
    : {
        nwkKey: sanitizeHex(appKey, 32).toLowerCase(),
      };

  const payload = { deviceKeys };

  try {
    // 1. On vérifie d'abord si des clés existent déjà
    let keysExist = false;
    try {
      const resp = await api.get(`/devices/${devEui}/keys`);
      // Si la requête réussit, c'est que l'objet "deviceKeys" existe
      if (resp.data && resp.data.deviceKeys) {
        keysExist = true;
      }
    } catch (err) {
      // Si 404, les clés n'existent pas encore
      if (err.response?.status !== 404) throw err;
    }

    if (keysExist) {
      // 2. Si elles existent, on utilise PUT (Mise à jour)
      console.log(`🔄 Mise à jour des clés pour ${devEui}...`);
      await api.put(`/devices/${devEui}/keys`, payload);
    } else {
      // 3. Si elles n'existent pas, on utilise POST (Création)
      console.log(`🆕 Création des clés pour ${devEui}...`);
      await api.post(`/devices/${devEui}/keys`, payload);
    }

    // console.log(`✅ Clés configurées pour ${devEui}`);
  } catch (err) {
    // Si malgré tout on a une erreur de "duplicate" (code 13 ou message contenant "unique constraint")
    if (err.response?.data?.message?.includes("unique constraint")) {
      console.log(
        `⚠️ Conflit détecté par la base de données, tentative de mise à jour forcée...`,
      );
      await api.put(`/devices/${devEui}/keys`, payload);
    } else {
      throw err;
    }
  }
}

async function provision() {
  try {
    const tenantId = await getTenantId();
    const devices = [];
    let stream = fs
      .createReadStream("/csv/showerheads.csv")
      .pipe(csv({ separator: ";" }));
    for await (const row of stream) {
      devices.push(row);
    }

    for (const dev of devices) {
      const devEUI = sanitizeHex(dev.devEUI, 16);
      console.log(`--- Device : ${dev.deviceName} (${devEUI}) ---`);

      // 1. Application
      const appResp = await api.get(
        `/applications?tenantId=${tenantId}&limit=100`,
      );
      let appId = appResp.data.result?.find(
        (a) => a.name === dev.applicationName,
      )?.id;

      if (!appId) {
        const newApp = await api.post("/applications", {
          application: { name: dev.applicationName, tenantId: tenantId },
        });
        appId = newApp.data.id;
      }

      // 2. Profile ID (retourne l'ID string)
      const profileId = await getOrCreateDeviceProfile(
        tenantId,
        dev.profileName,
      );

      // 3. Device avec Tags
      const tags = parseTags(dev.tags);
      let device = {
        devEui: devEUI,
        name: dev.deviceName,
        description: dev.description,
        applicationId: appId,
        deviceProfileId: profileId, // Utilisation directe de l'ID
        isDisabled: false,
        tags: tags,
      };

      try {
        // 1. Tenter de récupérer le device existant
        let existingDevice = null;
        try {
          const getResp = await api.get(`/devices/${device.devEui}`);
          existingDevice = getResp.data.device;
          console.log(`ℹ️ Device "${dev.deviceName}" existe déjà.`);
        } catch (err) {
          if (err.response?.status !== 404) {
            throw err;
          }
          // Si c'est un 404, c'est que le device n'existe pas, on continue
        }

        if (!existingDevice) {
          console.log(`try to add device : ${JSON.stringify(device)}`);
          await api.post("/devices", {
            device: device,
          });

          console.log(`✅ ${dev.deviceName} ajouté avec tags:`, tags);
        }

        // 4. Clés : appKey seule (LoRaWAN 1.0.x) ou appKey + networkKey (LoRaWAN 1.1+)
        await setDeviceKeys(device.devEui, dev.appKey, dev.networkKey || null);
      } catch (err) {
        if (err.response?.status === 409) {
          console.log(`ℹ️ ${dev.deviceName} existe déjà...`);
        } else {
          throw err;
        }
      }
    }

    const gateways = [];
    stream = fs
      .createReadStream("/csv/gateways.csv")
      .pipe(csv({ separator: ";" }));
    for await (const row of stream) {
      gateways.push(row);
    }

    for (const gw of gateways) {
      const gwId = sanitizeHex(gw.gatewayID, 16);
      console.log(`--- Gateway : ${gw.name} (${gwId}) ---`);

      try {
        let existingGw = null;
        try {
          const resp = await api.get(`/gateways/${gwId}`);
          existingGw = resp.data.gateway;
        } catch (err) {
          if (err.response?.status !== 404) throw err;
        }

        const gwPayload = {
          gateway: {
            gatewayId: gwId,
            name: gw.name,
            description: gw.description,
            tenantId: tenantId,
            statsInterval: parseInt(gw.statsInterval) || 30,
            // Optionnel : vous pouvez ajouter lat/long/alt ici
          },
        };

        if (existingGw) {
          console.log(`🔄 Mise à jour de la gateway ${gwId}...`);
          await api.put(`/gateways/${gwId}`, gwPayload);
        } else {
          console.log(`🆕 Création de la gateway ${gwId}...`);
          await api.post("/gateways", gwPayload);
        }
      } catch (err) {
        console.error(
          `❌ Erreur sur GW ${gw.name}:`,
          err.response?.data || err.message,
        );
      }
    }
  } catch (error) {
    console.error("❌ Erreur :", error.response?.data || error.message);
  }
}

provision();
