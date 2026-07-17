# VpnHood VPS Setup Guide

This guide covers how to install and configure the core VpnHood Server on your Linux VPS. Once this is set up, you can deploy the Custom API to manage it.

## 1. Install the Server (Direct Install)

To install the VpnHood server directly on the host (requires root):

```bash
sudo su -c "bash <( wget -qO- https://github.com/vpnhood/VpnHood.App.Server/releases/latest/download/VpnHoodServer-linux.sh)"
```

_Pick "Auto Start" when it prompts, so systemd manages the process afterward._

## 2. Open the Firewall

The server runs on port 443 by default with no extra configuration needed for TCP. Open this port in your OS firewall:

```bash
sudo ufw allow 443/tcp
```

**Note on UDP**: UDP is trickier — its default value is `0`, meaning the OS assigns a random port, which is awkward to firewall cleanly. Pin it to a fixed port in step 5 if you need strict UDP rules.

_Also check your provider's separate cloud firewall/security group (DigitalOcean, AWS, Hetzner, etc.) — `ufw` only covers the OS level._

## 3. Generate a Client Access Key

To manually generate a key for testing:

```bash
sudo /opt/VpnHoodServer/vhserver gen
```

Paste the resulting `vh://` token into the VpnHood client app to connect.

## 4. Manage the Service

You can check the status or restart the VpnHood server at any time:

```bash
sudo systemctl status VpnHoodServer
sudo systemctl restart VpnHoodServer
```

## 5. Customize & Change Ports (Optional)

You can configure the VpnHood server by creating or editing `appsettings.json` in the storage folder (which defaults to `/opt/VpnHoodServer/storage` on Linux).

If the file doesn't exist, create it with standard JSON. Here is an example of how to change your listening ports from the default `443` to `8443`, and pin the UDP port:

```json
{
  "FileAccessManager": {
    "TcpEndPoints": ["0.0.0.0:8443", "[::]:8443"],
    "UdpEndPoints": ["0.0.0.0:8443", "[::]:8443"],
    "PublicEndPoints": ["your-server-ip:8443"]
  }
}
```

**Important Settings:**

- `TcpEndPoints`: The TCP ports the server listens on locally.
- `UdpEndPoints`: The UDP ports. (Default is `0`, which assigns a random port. It's recommended to pin this to the same port as TCP so you can easily firewall it).
- `PublicEndPoints`: If you change the listening ports or run behind NAT, you should set this so the generated `vh://` keys contain the correct IP and port for clients to connect to.

_Always restart the service after any change to `appsettings.json`:_

```bash
sudo systemctl restart VpnHoodServer
```

## 6. Updating the Server

By default, VpnHood installs an automatic updater service (`VpnHoodUpdater`) alongside the server. It will automatically check for and apply updates in the background, so manual intervention is generally not required!

If you ever wish to disable automatic updates (not recommended, as it can cause client-server version mismatches), you can stop and disable the updater service:

```bash
sudo systemctl stop VpnHoodUpdater
sudo systemctl disable VpnHoodUpdater
```

To manually update the server, you can simply re-run the installation script from Step 1.

---

## Alternative: Docker Install

If you prefer running VpnHood in a Docker container:

```bash
sudo su -c "bash <( wget -qO- https://github.com/vpnhood/VpnHood.App.Server/releases/latest/download/VpnHoodServer.docker.sh)"
```

This installs the container plus an auto-updater.

To generate a key manually in the Docker version:

```bash
docker run -v "/opt/VpnHoodServer/storage:/app/storage" "vpnhood/vpnhoodserver" gen
```

_Same firewall rules apply — ensure TCP 443 is open in `ufw` and your provider's cloud firewall panel._
