#!/bin/sh
# Génère flows_cred.json avec le token InfluxDB chiffré selon le secret Node-RED,
# puis démarre Node-RED normalement.

if [ -n "${INFLUXDB_TOKEN}" ]; then
  node - <<'EOF'
const crypto = require('crypto');
const fs = require('fs');

const secret = process.env.NODE_RED_CREDENTIAL_SECRET || 'hydrao-lora-showerhead-cloud';
const token = process.env.INFLUXDB_TOKEN;
const nodeId = 'b2d70489494710b0';
const credFile = '/data/flows_cred.json';

const credentials = { [nodeId]: { token } };
const plaintext = JSON.stringify(credentials);

const iv = crypto.randomBytes(16);
const ivHex = iv.toString('hex');
const derivedKey = crypto.pbkdf2Sync(secret, ivHex, 1000, 32, 'sha1');
const cipher = crypto.createCipheriv('aes-256-ctr', derivedKey, iv);
const encrypted = cipher.update(plaintext, 'utf8', 'base64') + cipher.final('base64');

fs.writeFileSync(credFile, JSON.stringify({ '$': ivHex + encrypted }, null, 4));
console.log('[entrypoint] flows_cred.json généré avec le token InfluxDB.');
EOF
else
  echo "[entrypoint] INFLUXDB_TOKEN non défini, flows_cred.json non modifié."
fi

exec node-red "$@"
