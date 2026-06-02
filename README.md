# Hydrao LoRa Showerhead — Cloud Stack

A self-hosted IoT cloud stack for [Hydrao](https://www.hydrao.com) LoRaWAN smart showerheads. It receives shower data from LoRa gateways, decodes and stores the payloads, and serves real-time consumption dashboards to end users.

The entire stack runs as Docker containers and can be deployed on any Linux server or run locally for development.

---

## Table of Contents

1. [Architecture](#architecture)
2. [LoRaWAN Region Support](#lorawan-region-support)
3. [Prerequisites](#prerequisites)
4. [Quick Start (local)](#quick-start-local)
5. [Configuration Files](#configuration-files)
6. [Provisioning](#provisioning)
7. [Web Interfaces](#web-interfaces)
8. [Useful Commands](#useful-commands)
9. [Production Deployment](#production-deployment)
10. [License](#license)

---

## Architecture

```text
LoRa Gateway (US915 / EU868)
        │
        │  UDP (legacy)  ──►  chirpstack-gateway-bridge   (port 1700 / 1701)
        │  TCP (Basic Station) ►  chirpstack-gateway-bridge   (port 3001 / 3002)
        │
        ▼
   Mosquitto (MQTT)
        │
        ▼
   ChirpStack (LoRaWAN Network Server + Application Server)
        │  device uplinks (decoded JSON)
        ▼
   Node-RED  ──►  InfluxDB (time-series)
                       │
                       ▼
                   Grafana (dashboards)
```

| Service                       | Role                                 | Image                                    |
| ----------------------------- | ------------------------------------ | ---------------------------------------- |
| **ChirpStack**                | LoRaWAN Network & Application Server | `chirpstack/chirpstack:4`                |
| **chirpstack-gateway-bridge** | UDP / Basic Station gateway adapters | `chirpstack/chirpstack-gateway-bridge:4` |
| **chirpstack-rest-api**       | REST/Swagger API proxy               | `chirpstack/chirpstack-rest-api:4`       |
| **Mosquitto**                 | MQTT broker (internal bus)           | `eclipse-mosquitto:2`                    |
| **Node-RED**                  | Payload decoding and routing         | custom (Node.js 18)                      |
| **InfluxDB**                  | Time-series storage                  | `influxdb:2.7`                           |
| **Grafana**                   | User-facing dashboards               | `grafana/grafana:latest`                 |
| **PostgreSQL**                | ChirpStack relational data           | `postgres:14-alpine`                     |
| **Redis**                     | ChirpStack session cache             | `redis:7-alpine`                         |

---

## LoRaWAN Region Support

The stack supports two radio regions simultaneously:

| Region    | Frequencies | Gateway Bridge UDP | Gateway Bridge Basic Station |
| --------- | ----------- | ------------------ | ---------------------------- |
| **US915** | 902–928 MHz | port **1700/UDP**  | port **3001/TCP**            |
| **EU868** | 863–870 MHz | port **1701/UDP**  | port **3002/TCP**            |

Routing in Node-RED is automatic based on the `deviceProfileName` configured in ChirpStack (`Showerhead-US` or `Showerhead-EU`).

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2 (included in Docker Desktop)

---

## Quick Start (local)

### 1. Clone and configure

```bash
git clone https://github.com/hydrao-opensource/hydrao-lora-showerhead-cloud.git
cd hydrao-lora-showerhead-cloud
```

Copy the sample configuration files and edit them:

```bash
cp sample.env .env
cp sample.gateways.csv gateways.csv
cp sample.showerheads.csv showerheads.csv
cp sample.grafana_users.csv grafana_users.csv
```

Edit `.env` with your values (see [Configuration Files](#configuration-files)).  
Edit the CSV files with your actual gateways, devices, and users.

### 2. Start the stack

```bash
docker compose up -d
```

### 3. Initial ChirpStack setup

Open [http://localhost:8080](http://localhost:8080) and log in with `admin` / `admin`.

**Change the default password immediately:**

- **Users** → `admin` → **Change password**

**Generate an API token for provisioning:**

- **API Keys** → **Add API Key** → Name: `hydrao` → copy the generated token

Update `.env` with the token:

```env
CHIRPSTACK_API_TOKEN=<paste_token_here>
```

Restart the stack to apply it:

```bash
docker compose down
docker compose up -d
```

### 4. Provision gateways, devices, and users

```bash
# Register LoRa gateways and showerheads in ChirpStack
docker compose run --rm node-app node lora_provisioning.js

# Create Grafana user accounts
docker compose run --rm node-app node grafana_provisioning.js
```

The stack is now operational. Open Grafana at [http://localhost:3000](http://localhost:3000).

---

## Configuration Files

### `.env`

Copied from `sample.env`. Contains all runtime secrets and settings.

| Variable                     | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `POSTGRES_PASSWORD`          | PostgreSQL password for ChirpStack                 |
| `INFLUXDB_TOKEN`             | InfluxDB admin token (also used as password)       |
| `INFLUXDB_ORG`               | InfluxDB organisation name                         |
| `INFLUXDB_BUCKET`            | InfluxDB bucket name (default: `water_data`)       |
| `CHIRPSTACK_API_TOKEN`       | ChirpStack API token (generated after first start) |
| `MQTT_BROKER_HOST`           | Internal MQTT host (default: `mosquitto`)          |
| `NODE_RED_CREDENTIAL_SECRET` | Encryption key for Node-RED credentials            |
| `GRAFANA_ADMIN_USER`         | Grafana admin login                                |
| `GRAFANA_ADMIN_PASSWORD`     | Grafana admin password                             |

> Generate strong secrets with: `openssl rand -base64 32`

### `gateways.csv`

Semicolon-separated list of LoRa gateways to register in ChirpStack.

```csv
name;description;gatewayID;statsInterval
My_Gateway;Main building gateway;00005813d31c83a2;30
```

### `showerheads.csv`

Semicolon-separated list of showerhead devices to register in ChirpStack.

```csv
applicationName;profileName;devEUI;deviceName;appKey;networkKey;tags;description
Building A;Showerhead-US;3833323400260045;Showerhead GF;1111...bb;;"location:GF";"Lab"
Building B;Showerhead-EU-2025;bbcb2d9fb5d7bcaa;Showerhead 1F;efa9...ae;0ab4...b9;"location:1F";"Installed June 10"
```

The `profileName` must match a device profile defined in [node-app/device-profiles.csv](node-app/device-profiles.csv).  
The `networkKey` column is optional: leave it empty for LoRaWAN 1.0.x devices (single `appKey`), or fill it in for LoRaWAN 1.1+ devices that use both `appKey` and `networkKey`.

### `grafana_users.csv`

Semicolon-separated list of Grafana viewer accounts to create.

```csv
login;name;email;password
alice;Alice Smith;alice@example.com;s3cr3t
```

---

## Provisioning

The `node-app` service runs one-shot provisioning scripts. It is declared with a Docker Compose profile (`tools`) and does not start automatically.

| Script                    | What it does                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| `lora_provisioning.js`    | Creates gateways, device profiles, and showerhead devices in ChirpStack |
| `grafana_provisioning.js` | Creates Grafana viewer accounts from `grafana_users.csv`                |

Run them on demand:

```bash
docker compose run --rm node-app node lora_provisioning.js
docker compose run --rm node-app node grafana_provisioning.js
```

---

## Web Interfaces

| Service                       | URL                                                        | Notes                      |
| ----------------------------- | ---------------------------------------------------------- | -------------------------- |
| ChirpStack                    | [http://localhost:8080](http://localhost:8080)             | Default: `admin` / `admin` |
| ChirpStack REST API (Swagger) | [http://localhost:8090](http://localhost:8090)             | OpenAPI explorer           |
| Node-RED                      | [http://localhost:1880](http://localhost:1880)             | Flow editor                |
| InfluxDB                      | [http://localhost:8086](http://localhost:8086)             | Data explorer              |
| Grafana (admin)               | [http://localhost:3000](http://localhost:3000)             | Full UI                    |
| Grafana (kiosk / client)      | [http://localhost:3000?kiosk](http://localhost:3000?kiosk) | Dashboard-only view        |

---

## Useful Commands

```bash
# Start the stack
docker compose up -d

# Stop the stack
docker compose down

# Stop and delete all volumes (full reset)
docker compose down -v

# Follow logs for a specific service
docker compose logs -f chirpstack
docker compose logs -f nodered
docker compose logs -f grafana

# Delete a single named volume (without removing others)
docker volume rm hydrao-lora-showerhead-cloud_grafana_data

# Inspect environment variables of a running container
docker compose run --rm --entrypoint="" chirpstack env

# Delete all data from a specific InfluxDB measurement
docker compose exec -it influxdb bash
influx delete \
  --bucket water_data \
  --start 1970-01-01T00:00:00Z \
  --stop 2099-12-31T23:59:59Z \
  --predicate '_measurement="gateway_alerts"' \
  --org $DOCKER_INFLUXDB_INIT_ORG \
  --token $DOCKER_INFLUXDB_INIT_ADMIN_TOKEN
```

---

## Production Deployment

For deploying on a cloud VPS with HTTPS (via Caddy), automated backups (restic + Backblaze B2), and firewall configuration, see [DEPLOY.md](DEPLOY.md).

---

## License

Copyright 2026 Hydrao

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.
