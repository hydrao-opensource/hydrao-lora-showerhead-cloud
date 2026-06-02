// Configuration
const axios = require("axios");
const fs = require("fs");
const csv = require("csv-parser");

const GRAFANA_URL = process.env.GRAFANA_URL || "http://grafana:3000";
const ADMIN_AUTH = {
  username: process.env.GRAFANA_ADMIN_USER || "admin",
  password: process.env.GRAFANA_ADMIN_PASSWORD || "admin",
};

async function createOrUpdateUser(user) {
  try {
    // 1. Rechercher si l'utilisateur existe déjà par son login
    let userId;
    try {
      const lookup = await axios.get(
        `${GRAFANA_URL}/api/users/lookup?loginOrEmail=${user.login}`,
        { auth: ADMIN_AUTH },
      );
      userId = lookup.data.id;
      console.log(
        `🔍 Utilisateur trouvé : ${user.login} (ID: ${userId}). Mise à jour...`,
      );

      // 2. UPDATE (Mise à jour des infos de base)
      await axios.put(
        `${GRAFANA_URL}/api/users/${userId}`,
        {
          name: user.name,
          email: user.email,
          login: user.login,
        },
        { auth: ADMIN_AUTH },
      );

      // 3. UPDATE PASSWORD (C'est un endpoint séparé dans Grafana)
      await axios.put(
        `${GRAFANA_URL}/api/admin/users/${userId}/password`,
        {
          password: user.password,
        },
        { auth: ADMIN_AUTH },
      );
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // 4. CREATE (Si non trouvé)
        console.log(`✨ Création de l'utilisateur : ${user.login}`);
        const res = await axios.post(
          `${GRAFANA_URL}/api/admin/users`,
          {
            name: user.name,
            email: user.email,
            login: user.login,
            password: user.password,
          },
          { auth: ADMIN_AUTH },
        );
        userId = res.data.id;
      } else {
        throw error;
      }
    }

    // 5. GESTION DU RÔLE (Patch pour s'assurer que le rôle est correct)
    await axios.patch(
      `${GRAFANA_URL}/api/org/users/${userId}`,
      {
        role: "Viewer", // Vous pourriez aussi ajouter une colonne 'role' dans votre CSV
      },
      { auth: ADMIN_AUTH },
    );

    console.log(`✅ ${user.login} est à jour.`);
  } catch (err) {
    console.error(`❌ Erreur critique pour ${user.login}:`, err.message);
  }
}

// Fonction principale de lecture du CSV
async function runProvisioning() {
  console.log("🚀 Début du provisioning des utilisateurs...");

  const users = [];
  let stream = fs
    .createReadStream("/csv/grafana_users.csv")
    .pipe(csv({ separator: ";" }));
  for await (const row of stream) {
    users.push(row);
  }

  for (const user of users) {
    await createOrUpdateUser(user);
  }
  console.log("🏁 Provisioning terminé.");
}

runProvisioning();
