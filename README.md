# VpnHood Self-Hosting API

A comprehensive, robust REST API for managing VpnHood users, built with Node.js and Express. Features JWT-based authentication with refresh token rotation. Perfect for integrating with your own custom portfolio dashboards.

## Features

- **Full User Management**: Complete CRUD capabilities for VpnHood access keys.
- **Quota & Tracking**: View dynamic bandwidth usage, max connections, and expiration states.
- **JWT Authentication**: Secure cookie-based auth with access/refresh token rotation and MongoDB-backed user accounts.
- **Auto-Updating**: Built-in webhook endpoint to pull the latest code and restart via CI/CD pipelines.

## API Endpoints

### Authentication (Public)

| Method | Endpoint                  | Description                                  | Payload                           |
| ------ | ------------------------- | -------------------------------------------- | --------------------------------- |
| `POST` | `/api/auth/signup`        | Create a new admin account.                  | JSON: `name`, `email`, `password` |
| `POST` | `/api/auth/login`         | Login and receive auth cookies.              | JSON: `email`, `password`         |
| `POST` | `/api/auth/logout`        | Clear auth cookies and revoke refresh token. | None                              |
| `GET`  | `/api/auth/getAuthStatus` | Check if the current session is valid.       | None (reads cookie)               |
| `POST` | `/api/auth/refresh`       | Rotate access & refresh tokens.              | None (reads cookie)               |

### VPN Management (Protected — requires login)

| Method   | Endpoint              | Description                                                                           | Payload / Parameters                                                          |
| -------- | --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET`    | `/api/users`          | Returns a list of all provisioned VPN users and their usage stats.                    | None                                                                          |
| `GET`    | `/api/users/:tokenId` | Fetches detailed data for a specific user and their `vh://` connection string.        | `tokenId` (URL Param)                                                         |
| `POST`   | `/api/users`          | Generates a new VPN user token.                                                       | JSON: `name` (req), `maxTrafficMB`, `maxClient`, `maxSpeedMbps`, `expireDate` |
| `DELETE` | `/api/users/:tokenId` | Revokes a user's VPN access instantly by deleting their token file.                   | `tokenId` (URL Param)                                                         |
| `POST`   | `/api/webhook/update` | Pulls the latest code from GitHub, runs npm install, and restarts the server via PM2. | JSON: `secret` (Must match `WEBHOOK_SECRET` in `.env`)                        |

### Health Check (Public)

| Method | Endpoint | Description            |
| ------ | -------- | ---------------------- |
| `GET`  | `/`      | Returns server uptime. |

### Generating Secrets

To generate secure strings for `TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `WEBHOOK_SECRET` in the `.env` file:

```bash
openssl rand -hex 64
```

Or if you're using Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Deployment on the VPS

To run this API on your VpnHood server in production, follow these steps:

> **Note:** Before deploying this API, you must have the VpnHood server installed and running on your VPS. See [VPNHOOD_SETUP.md](VPNHOOD_SETUP.md) for full installation and configuration instructions.

### 1. Clone the Code (Using Git)

Instead of manually uploading the files, we recommend using Git. SSH into your VPS and clone your repository:

```bash
cd /opt
sudo git clone https://github.com/JitishxD/vpnhood-api.git vpnhood-api
```

### 2. Install Node.js

If you haven't installed Node.js on your VPS yet, install it via NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Configure VpnHood Permissions

The API needs read access to `/opt/VpnHoodServer/storage/` and the ability to run `sudo /opt/VpnHoodServer/vhserver gen` to fetch and create keys.

Install ACL (if missing) and set the correct permissions:

```bash
sudo apt update && sudo apt install acl -y

# Create a dedicated service user
sudo useradd -r -s /usr/sbin/nologin vhapi

# Grant read access to the storage directory
sudo setfacl -R -m u:vhapi:rX /opt/VpnHoodServer/storage
sudo setfacl -R -d -m u:vhapi:rX /opt/VpnHoodServer/storage

# Grant specific passwordless sudo commands for generating and printing keys
echo 'vhapi ALL=(root) NOPASSWD: /opt/VpnHoodServer/vhserver gen *, /opt/VpnHoodServer/vhserver print *' | sudo tee /etc/sudoers.d/vhapi-gen
sudo chmod 440 /etc/sudoers.d/vhapi-gen
```

### 4. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cd /opt/vpnhood-api
cp .env.example .env
nano .env
```

You **must** set: `MONGODB_URI`, `TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `WEBHOOK_SECRET`, and `CORS_ORIGIN`.

### 5. Install Dependencies & Start the API

```bash
cd /opt/vpnhood-api
sudo npm install
sudo npm install -g pm2

# Start the API
sudo pm2 start index.js --name "vpnhood-api"
sudo pm2 save
sudo pm2 startup
```

_The API is now running on `http://127.0.0.1:5000`._

### 6. Expose Securely (Reverse Proxy)

To safely consume this API from your frontend (wherever it's hosted), you should expose it over HTTPS. We recommend **Caddy** for automatic SSL.

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Edit your Caddyfile (`sudo nano /etc/caddy/Caddyfile`):

```caddyfile
api.yourdomain.com {
    reverse_proxy 127.0.0.1:5000
}
```

_(Make sure to point your DNS A record to your VPS IP)._

Format and validate your Caddyfile to ensure there are no syntax errors:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
```

Restart Caddy to apply changes:

```bash
sudo systemctl restart caddy
```

You can now hit your robust VpnHood backend at `https://api.yourdomain.com/api/users` from your portfolio project!

---

## FAQ

### Why not a unified "Server Farm" with one key?

As noted in the [VpnHood-Server-Configuration.md](https://github.com/vpnhood/VpnHood/wiki/VpnHood-Server-Configuration) wiki file, VpnHood has two modes for managing access:

1. **FileAccessManager (What we built)**: The simple, built-in file server. It runs locally on the VPS and stores tokens in `.token2` files. It is strictly single-node.
2. **HttpAccessManager (The Cloud Way difficult)**: This is what allows Server Farms (grouping multiple VPS locations under a single access key). However, to use this, the VPS nodes need to talk to a centralized enterprise Access Server. thats what https://console.vpnhood.com do
