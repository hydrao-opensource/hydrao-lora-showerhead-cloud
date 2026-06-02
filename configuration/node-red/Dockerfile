# On part de l'image officielle légère
FROM nodered/node-red:latest

# On repasse en utilisateur root temporairement pour installer des paquets si besoin
USER root

# Installation des nœuds supplémentaires (InfluxDB et Dashboard)
# Vous pouvez ajouter d'autres nœuds ici en les séparant par des espaces
RUN npm install node-red-contrib-influxdb \
                node-red-dashboard \
                node-red-node-ui-table

# Script de démarrage : génère flows_cred.json avec le token InfluxDB chiffré
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# On repasse en utilisateur node-red pour la sécurité
USER node-red

# On définit le dossier de travail
WORKDIR /usr/src/node-red

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]