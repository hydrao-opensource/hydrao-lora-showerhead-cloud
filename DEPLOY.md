# Deployment Guide

Complete IoT stack: ChirpStack · Mosquitto · Node-RED · InfluxDB · Grafana

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Choose a Cloud Server](#2-choose-a-cloud-server)
   - [Option A — Hetzner Cloud](#option-a--hetzner-cloud)
   - [Option B — OVH VPS](#option-b--ovh-vps)
3. [Configure the Firewall](#3-configure-the-firewall)
4. [Acquire and Configure a Domain Name](#4-acquire-and-configure-a-domain-name)
5. [Configure the Server](#5-configure-the-server)
6. [Deploy the Project](#6-deploy-the-project)
7. [Configure HTTPS with Caddy](#7-configure-https-with-caddy)
8. [Provision Data](#8-provision-data)
9. [Final Verification](#9-final-verification)

---

## 1. Prerequisites

**Before you start, you will need:**

- The three data files provided separately:
  - `showerheads.csv` — list of showerheads
  - `gateways.csv` — list of LoRa gateways
  - `grafana_users.csv` — Grafana user accounts
- An SSH client (Terminal on Mac/Linux, PuTTY on Windows)
- A domain name — purchase and DNS configuration are covered in step 4, once the server IP is known

**Network ports used by the stack:**

| Port | Protocol | Service                              | Exposure                                        |
| ---- | -------- | ------------------------------------ | ----------------------------------------------- |
| 22   | TCP      | SSH                                  | Administration                                  |
| 80   | TCP      | HTTP                                 | HTTPS redirect (Caddy)                          |
| 443  | TCP      | HTTPS                                | Grafana + ChirpStack UI                         |
| 1700 | UDP      | Gateway Bridge UDP — US915           | LoRa gateways US915 (legacy UDP protocol)       |
| 1701 | UDP      | Gateway Bridge UDP — EU868           | LoRa gateways EU868 (legacy UDP protocol)       |
| 3001 | TCP      | Gateway Bridge Basic Station — US915 | LoRa gateways US915 (secure Basic Station)      |
| 3002 | TCP      | Gateway Bridge Basic Station — EU868 | LoRa gateways EU868 (secure Basic Station)      |
| 1883 | TCP      | MQTT                                 | LoRa gateways (if direct MQTT access is needed) |

Ports 8080, 8086, 1880, and 8090 remain internal (not publicly exposed).

---

## 2. Choose a Cloud Server

### Option A — Hetzner Cloud

> Best value for money. Data centers in Germany and Finland.

**Recommended:** `CAX21` (ARM, 4 vCPU, 8 GB RAM) — ~€7/month  
Minimum viable: `CAX11` (2 vCPU, 4 GB RAM) — ~€4/month

**Create the server:**

1. Create an account at [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Create a new project → **Add Server**
3. Choose a region: `Nuremberg` or `Helsinki`
4. Image: **Ubuntu 24.04**
5. Type: `CAX11` or `CAX21`
6. Add your SSH public key (recommended) or note the root password
7. Click **Create & Buy**

**The public IP is displayed immediately in the dashboard — note it down, it will be needed in step 4.**

**Hetzner Firewall (Cloud Firewall):**

In the Hetzner panel → **Firewalls** → **Create Firewall**:

| Direction | Protocol | Port | Source                         |
| --------- | -------- | ---- | ------------------------------ |
| Inbound   | TCP      | 22   | `0.0.0.0/0` (or your fixed IP) |
| Inbound   | TCP      | 80   | `0.0.0.0/0`                    |
| Inbound   | TCP      | 443  | `0.0.0.0/0`                    |
| Inbound   | UDP      | 1700 | `0.0.0.0/0`                    |
| Inbound   | UDP      | 1701 | `0.0.0.0/0`                    |
| Inbound   | TCP      | 3001 | `0.0.0.0/0`                    |
| Inbound   | TCP      | 3002 | `0.0.0.0/0`                    |
| Inbound   | TCP      | 1883 | `0.0.0.0/0`                    |

Then assign this firewall to the created server.

---

### Option B — OVH VPS

> French hosting provider, European data centers, French-speaking support.

**Recommended:** `VPS Comfort` (4 vCPU, 8 GB RAM) — ~€14/month  
Minimum viable: `VPS Essential` (2 vCPU, 4 GB RAM) — ~€7/month

**Create the server:**

1. Go to [ovhcloud.com](https://www.ovhcloud.com/en/vps/)
2. Choose a VPS Essential or Comfort
3. Select a region: `Gravelines (France)` or `Strasbourg (France)`
4. Operating system: **Ubuntu 24.04**
5. Complete the order — root credentials and **the public IP** arrive by email

**OVH Firewall (Network Firewall):**

OVH provides an upstream network firewall. Enable it in the control panel:  
**Bare Metal Cloud → IP → (shield icon) → Enable firewall**

Add the following rules (in ascending priority order):

| Priority | Action | Protocol | Destination Port |
| -------- | ------ | -------- | ---------------- |
| 0        | Allow  | TCP      | 22               |
| 1        | Allow  | TCP      | 80               |
| 2        | Allow  | TCP      | 443              |
| 3        | Allow  | UDP      | 1700             |
| 4        | Allow  | UDP      | 1701             |
| 5        | Allow  | TCP      | 3001             |
| 6        | Allow  | TCP      | 3002             |
| 7        | Allow  | TCP      | 1883             |
| 19       | Deny   | IPv4     | All              |

> **OVH note:** the network firewall is optional. You can also use only `ufw` on the server (see next section).

---

## 3. Configure the Firewall

**Local `ufw` firewall (valid for both Hetzner and OVH):**

Connect to the server via SSH, then:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 1700/udp   # Gateway Bridge UDP US915
ufw allow 1701/udp   # Gateway Bridge UDP EU868
ufw allow 3001/tcp   # Gateway Bridge Basic Station US915
ufw allow 3002/tcp   # Gateway Bridge Basic Station EU868
ufw allow 1883/tcp
ufw enable
ufw status
```

On OVH, combining both the network firewall and `ufw` provides a double layer of protection.

> If your LoRa gateways have fixed IPs, restricting ports 1700/UDP and 1883/TCP to those IPs only improves security.

---

## 4. Acquire and Configure a Domain Name

At this point you have the server's public IP. You can now purchase a domain and configure the DNS records.

### Choose a Registrar and Extension

For internal or client use, an expensive `.com` is not necessary. The cheapest extensions from reliable registrars:

| Registrar                                   | Extension | Indicative price | Notes                                          |
| ------------------------------------------- | --------- | ---------------- | ---------------------------------------------- |
| [OVH](https://www.ovhcloud.com/en/domains/) | `.ovh`    | ~€1/year         | Convenient if using OVH VPS — all in one place |
| [OVH](https://www.ovhcloud.com/en/domains/) | `.fr`     | ~€7/year         | French address required                        |
| [Porkbun](https://porkbun.com)              | `.xyz`    | ~€1/year         | No restrictions, renewal ~€12/year             |
| [Namecheap](https://www.namecheap.com)      | `.xyz`    | ~€1/year         | Simple interface, free WHOIS privacy           |
| [Gandi](https://www.gandi.net/en)           | `.net`    | ~€12/year        | French registrar, high quality                 |

> **Recommendation:** if you are using OVH for your VPS, register the domain at OVH with `.ovh` (~€1/year). Everything is managed in one place.

### Purchase a Domain (OVH example)

1. Go to [ovhcloud.com/en/domains](https://www.ovhcloud.com/en/domains/)
2. Search for `mydomain.ovh` in the search bar
3. Add to cart and complete the order
4. The domain is available within minutes

### Create DNS Records

Once the domain is registered, access the DNS management and create two `A` records pointing to the server IP obtained in step 2.

**At OVH:**  
Control panel → **Web Cloud** → **Domain names** → select the domain → **DNS Zone** tab → **Add an entry**

| Subdomain    | Type | Target (TTL: 3600) |
| ------------ | ---- | ------------------ |
| `chirpstack` | A    | `<SERVER_IP>`      |
| `grafana`    | A    | `<SERVER_IP>`      |

**At Namecheap / Porkbun:**  
Dashboard → your domain → **Manage DNS** → **Add Record**

| Host         | Type | Value         | TTL  |
| ------------ | ---- | ------------- | ---- |
| `chirpstack` | A    | `<SERVER_IP>` | 3600 |
| `grafana`    | A    | `<SERVER_IP>` | 3600 |

### Verify DNS Propagation

Propagation takes anywhere from a few minutes to 24 hours. To check from your local machine:

```bash
# Should return your server IP
nslookup chirpstack.mydomain.com
nslookup grafana.mydomain.com

# Or with dig
dig chirpstack.mydomain.com +short
```

Do not proceed to step 7 (Caddy) until both subdomains return the correct IP.

### Free Alternative — DuckDNS (no domain purchase)

To test without buying a domain, [DuckDNS](https://www.duckdns.org) offers free subdomains like `myproject.duckdns.org`. HTTPS will also work with Caddy + Let's Encrypt.

1. Log in at [duckdns.org](https://www.duckdns.org) with a Google or GitHub account
2. Create two subdomains: `chirpstack-myproject` and `grafana-myproject`
3. Enter the server IP for each
4. Use `chirpstack-myproject.duckdns.org` and `grafana-myproject.duckdns.org` throughout this guide

---

## 5. Configure the Server

Connect to the server:

```bash
ssh root@<SERVER_IP>
```

Update the system and install Docker:

```bash
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify the installation
docker --version
docker compose version
```

Install Caddy (HTTPS reverse proxy):

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

---

## 6. Deploy the Project

Transfer the project to the server. From your local machine:

```bash
# Copy the full project (excluding node_modules)
rsync -av --exclude='node-app/node_modules' \
  /local/path/hydrao-lora-showerhead-cloud/ \
  root@<SERVER_IP>:/opt/hydrao-lora-showerhead-cloud/
```

Or via git if the project is in a repository:

```bash
# On the server
cd /opt
git clone https://github.com/hydrao-opensource/hydrao-lora-showerhead-cloud.git hydrao-lora-showerhead-cloud
```

Copy the separately provided data files:

```bash
# From your local machine
scp showerheads.csv   root@<SERVER_IP>:/opt/hydrao-lora-showerhead-cloud/node-app/
scp gateways.csv      root@<SERVER_IP>:/opt/hydrao-lora-showerhead-cloud/node-app/
scp grafana_users.csv root@<SERVER_IP>:/opt/hydrao-lora-showerhead-cloud/node-app/
```

Configure environment variables on the server:

```bash
cd /opt/hydrao-lora-showerhead-cloud
cp sample.env .env
nano .env
```

Fill in the `.env` file with secure values:

```env
# Databases
POSTGRES_PASSWORD=<strong_password>
INFLUXDB_TOKEN=<long_random_token>
INFLUXDB_ORG=<your_organization_name>
INFLUXDB_BUCKET=water_data

# ChirpStack (generate a token after first startup)
CHIRPSTACK_API_TOKEN=<fill_in_after_first_startup>

# MQTT
MQTT_BROKER_HOST=mosquitto

# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<strong_password>
```

> To generate strong passwords: `openssl rand -base64 32`

Start the stack:

```bash
cd /opt/hydrao-lora-showerhead-cloud
docker compose up -d

# Follow logs during startup
docker compose logs -f
```

Wait about 30 seconds for all services to be `healthy`, then verify:

```bash
docker compose ps
```

All services should show `running` or `Up`.

---

## 7. Configure HTTPS with Caddy

Caddy automatically manages Let's Encrypt certificates. Simply point it to the correct internal ports.

> First verify that your DNS has propagated (step 4): `nslookup chirpstack.mydomain.com` should return the server IP.

Edit the Caddy configuration:

```bash
nano /etc/caddy/Caddyfile
```

Replace the entire content with:

```caddyfile
chirpstack.mydomain.com {
    reverse_proxy localhost:8080 {
        # Required for ChirpStack's gRPC-Web protocol
        transport http {
            versions h2c
        }
    }
}

grafana.mydomain.com {
    reverse_proxy localhost:3000
}
```

Replace `mydomain.com` with your actual domain, then reload Caddy:

```bash
systemctl reload caddy

# Check for errors
systemctl status caddy
journalctl -u caddy -f
```

HTTPS certificates are obtained automatically. After a few seconds:

- ChirpStack: `https://chirpstack.mydomain.com`
- Grafana: `https://grafana.mydomain.com`

---

## 8. Provision Data

Provisioning is done after the stack is fully started.

### Step 1 — Generate the ChirpStack API Token

1. Log in to `https://chirpstack.mydomain.com`
2. Default credentials: `admin` / `admin` (change immediately)
3. Go to **API Keys** (left menu) → **Add API Key**
4. Name the key (e.g. `provisioning`) → copy the generated token
5. Update it in `/opt/hydrao-lora-showerhead-cloud/.env`:

```bash
nano /opt/hydrao-lora-showerhead-cloud/.env
# Update CHIRPSTACK_API_TOKEN=<copied_token>
```

Restart the stack to apply the new token:

```bash
cd /opt/hydrao-lora-showerhead-cloud
docker compose restart
```

### Step 2 — Run LoRa Provisioning (gateways + showerheads)

```bash
cd /opt/hydrao-lora-showerhead-cloud
docker compose run --rm node-app node lora_provisioning.js
```

This script creates in ChirpStack:

- Gateways from `gateways.csv`
- Device profiles from `device-profiles.csv`
- Showerheads from `showerheads.csv`

### Step 3 — Run Grafana Provisioning (users)

```bash
docker compose run --rm node-app node grafana_provisioning.js
```

This script creates the Grafana user accounts defined in `grafana_users.csv`.

**Expected CSV file formats:**

`gateways.csv` (separator `;`):

```csv
name;description;gatewayID;statsInterval
My_Gateway;Description;00005813d31c83a2;30
```

`showerheads.csv` (separator `;`):

```csv
applicationName;profileName;devEUI;deviceName;appKey;networkKey;tags;description
Building A;Showerhead-US;3833323400260045;Cereus GF;1111...bb;;"location:GF";"Lab"
Building B;Showerhead-EU-11;4433323400260045;Cereus 1F;2222...cc;3333...dd;"location:1F";"Lab"
```

> The `networkKey` column is optional. Leave it empty for LoRaWAN 1.0.x devices (single key). Provide it for LoRaWAN 1.1+ devices, which require both an `appKey` and a `networkKey`.

`grafana_users.csv` (separator `;`):

```csv
login;name;email;password
alice;Alice Smith;alice@example.com;password
```

---

## 9. Final Verification

Verify that each service responds correctly:

```bash
# All containers are UP
docker compose ps

# ChirpStack accessible via HTTPS
curl -s https://chirpstack.mydomain.com/api/internal/login

# Grafana accessible via HTTPS
curl -s https://grafana.mydomain.com/api/health

# MQTT accessible from the server
apt install -y mosquitto-clients
mosquitto_pub -h localhost -p 1883 -t test -m "ping"

# UDP ports open (from your local machine)
nc -uvz <SERVER_IP> 1700   # US915
nc -uvz <SERVER_IP> 1701   # EU868
```

**Installation URLs:**

| Service    | URL                                       |
| ---------- | ----------------------------------------- |
| ChirpStack | `https://chirpstack.mydomain.com`         |
| Grafana    | `https://grafana.mydomain.com`            |
| Node-RED   | `http://<IP>:1880` (internal access only) |
| InfluxDB   | `http://<IP>:8086` (internal access only) |

> Node-RED and InfluxDB are not exposed via HTTPS as they are not intended for public access. If needed, add additional blocks to the Caddyfile.

---

## Maintenance

### Update the Stack

```bash
cd /opt/hydrao-lora-showerhead-cloud
git pull                            # if the project is in a git repository
docker compose pull                 # pull new images
docker compose up -d                # restart with new images
```

### View Service Logs

```bash
docker compose logs -f chirpstack
docker compose logs -f grafana
docker compose logs -f nodered
```

---

## Automatic Restart on VPS Reboot

Two conditions are required for the stack to restart automatically after a server reboot.

**1. Docker starts on boot (enabled by default with the installation script):**

```bash
systemctl enable docker
systemctl is-enabled docker   # should print "enabled"
```

**2. Caddy starts on boot:**

```bash
systemctl enable caddy
systemctl is-enabled caddy    # should print "enabled"
```

**3. Docker containers restart automatically.**

The services defined in `docker-compose.yaml` already have `restart: unless-stopped`. This means they restart automatically after a server reboot, but not if you stop them manually with `docker compose down`.

Verify the policy is correctly applied:

```bash
docker inspect --format='{{.Name}} → {{.HostConfig.RestartPolicy.Name}}' \
  $(docker compose ps -q)
```

Each service should show `unless-stopped`.

**Test reboot resilience:**

```bash
reboot
# Wait 60 seconds, then reconnect and verify
ssh root@<SERVER_IP>
docker compose -f /opt/hydrao-lora-showerhead-cloud/docker-compose.yaml ps
systemctl status caddy
```

---

## Automated Backups with External Storage

The stack has three data sources to back up: PostgreSQL (ChirpStack config), InfluxDB (consumption data), and the `.env` file (secrets).

The recommended tool is **restic**, which encrypts backups client-side before upload. The recommended external storage is **Backblaze B2** (~$0.006/GB/month, a few cents per month for this volume).

### Create a Backblaze B2 Bucket

1. Create an account at [backblaze.com](https://www.backblaze.com)
2. Go to **B2 Cloud Storage** → **Buckets** → **Create a Bucket**
3. Name: `hydrao-backup` — Type: **Private**
4. Go to **App Keys** → **Add a New Application Key**
   - Restrict the key to the `hydrao-backup` bucket
   - Permissions: `Read and Write`
5. Copy the `keyID` and `applicationKey` shown (they are only visible once)

### Install restic and Initialize the Repository

On the server:

```bash
apt install -y restic

# Store the encryption password in a protected file
echo "STRONG_ENCRYPTION_PASSWORD" > /etc/restic-password
chmod 600 /etc/restic-password

# Store Backblaze credentials in a protected file
cat > /etc/restic-env <<EOF
export B2_ACCOUNT_ID=your_keyID
export B2_ACCOUNT_KEY=your_applicationKey
export RESTIC_REPOSITORY=b2:hydrao-backup:restic
export RESTIC_PASSWORD_FILE=/etc/restic-password
EOF
chmod 600 /etc/restic-env

# Initialize the restic repository (once only)
source /etc/restic-env
restic init
```

### Create the Backup Script

```bash
cat > /usr/local/bin/hydrao-backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail

source /etc/restic-env

PROJECT_DIR=/opt/hydrao-lora-showerhead-cloud
BACKUP_TMP=/tmp/hydrao-backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_TMP"

# PostgreSQL
docker compose -f "$PROJECT_DIR/docker-compose.yaml" exec -T postgres \
    pg_dump -U chirpstack chirpstack > "$BACKUP_TMP/postgres.sql"

# InfluxDB
INFLUX_ID=$(docker compose -f "$PROJECT_DIR/docker-compose.yaml" ps -q influxdb)
docker exec "$INFLUX_ID" influx backup /tmp/influx-backup --skip-verify
docker cp "$INFLUX_ID:/tmp/influx-backup" "$BACKUP_TMP/influxdb"
docker exec "$INFLUX_ID" rm -rf /tmp/influx-backup

# Configuration file (contains secrets)
cp "$PROJECT_DIR/.env" "$BACKUP_TMP/"

# Encrypted upload to Backblaze B2
restic backup "$BACKUP_TMP"

# Local cleanup
rm -rf "$BACKUP_TMP"

# Retention policy: 7 daily, 4 weekly, 3 monthly
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune
EOF

chmod +x /usr/local/bin/hydrao-backup.sh
```

Test manually before scheduling:

```bash
/usr/local/bin/hydrao-backup.sh
restic snapshots    # list available backups
```

### Schedule with Cron

```bash
# Run backup every night at 2:00 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/hydrao-backup.sh >> /var/log/hydrao-backup.log 2>&1") | crontab -

# Verify the cron rule is registered
crontab -l
```

### Restore a Backup

```bash
source /etc/restic-env

# List available restore points
restic snapshots

# Restore the latest snapshot to a temporary folder
restic restore latest --target /tmp/hydrao-restore

# Restore PostgreSQL
docker compose -f /opt/hydrao-lora-showerhead-cloud/docker-compose.yaml exec -T postgres \
    psql -U chirpstack chirpstack < /tmp/hydrao-restore/postgres.sql

# Restore InfluxDB
INFLUX_ID=$(docker compose -f /opt/hydrao-lora-showerhead-cloud/docker-compose.yaml ps -q influxdb)
docker cp /tmp/hydrao-restore/influxdb "$INFLUX_ID:/tmp/influx-restore"
docker exec "$INFLUX_ID" influx restore /tmp/influx-restore --skip-verify

# Cleanup
rm -rf /tmp/hydrao-restore
```
