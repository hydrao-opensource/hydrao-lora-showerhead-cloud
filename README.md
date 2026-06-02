# Hydrao Lora ShowerHead Cloud

## Régions LoRaWAN supportées

La stack supporte simultanément deux régions radio :

| Région | Fréquences  | Gateway Bridge UDP | Gateway Bridge Basic Station |
| ------ | ----------- | ------------------ | ---------------------------- |
| US915  | 902–928 MHz | port **1700/UDP**  | port **3001/TCP**            |
| EU868  | 863–870 MHz | port **1701/UDP**  | port **3002/TCP**            |

Le routage dans Node-RED s'effectue automatiquement selon le `deviceProfileName` configuré dans ChirpStack (`Showerhead-US` ou `Showerhead-EU`).

## How to start

- install Docker & Docker-compose
- copy sample.env => .env
- edit .env for customize configuration
- copy sample.gateways.csv => gateways.csv
- edit gateways.csv to add LoRa gateways
- copy sample.showerheads.csv => showerheads.csv
- edit showerheads.csv to add client devices
- copy sample.grafana_users.csv => grafana_users.csv
- edit grafana_users.csv to add client users to grafana UI

```bash
# build and run project
docker-compose up -d
```

- open localhost:8080 in web browser (login = admin/admin)
  - update default login password =>
    - users > admin > change password
  - generate api-token for chirpstack =>
    - network server > api keys > add api key > name=hydrao
- update .env for CHIRPSTACK_API_TOKEN
- restart project

```bash
docker-compose down
docker-compose up -d
```

- provisionning (lora devices, gateways & profiles, grafana users)

```bash
docker-compose run --rm node-app node lora_provisioning.js
docker-compose run --rm node-app node grafana_provisioning.js

```

## Interfaces Web

- Chirpstack : <http://localhost:8080>
- Chirpstack API (swagger): <http://localhost:8090>
- NodeRed : <http://localhost:1880>
- InfluxDB : <http://localhost:8086>
- Grafana Admin : <http://localhost:3000>
- Grafana Client : <http://localhost:3000?kiosk>

## Commands

```bash
# clean containers + volumes (global clean)
docker-compose down -v

# clear a specific volume (without mount)
docker volume rm hydrao-lora-showerhead-cloud_grafana_data

# watch container logs
docker-compose logs chirpstack

# container logs stream
docker-compose logs -f chirpstack

# check container env vars
docker compose run --rm --entrypoint="" chirpstack env

# delete all data of a measurement in influxdb
docker-compose exec -it influxdb bash
influx delete --bucket water_data --start 1970-01-01T00:00:00Z --stop 2026-03-31T23:59:59Z --predicate '_measurement="gateway_alerts"' --org $DOCKER_INFLUXDB_INIT_ORG --token $DOCKER_INFLUXDB_INIT_ADMIN_TOKEN
```
