#!/usr/bin/env bash
set -euo pipefail

SSH_CONFIG="$(dirname "$0")/../.ssh/config"
SERVER="dlp"

ssh -F "$SSH_CONFIG" "$SERVER" bash -s <<'REMOTE'
set -euo pipefail

apt-get update && apt-get install -y nginx certbot python3-certbot-nginx

mkdir -p /var/www/delogischepartij.nl/public
mkdir -p /var/www/stemdlp.nl/public

# Request certificates (run manually first time)
# certbot certonly --nginx -d delogischepartij.nl -d www.delogischepartij.nl -d delogischepartij.eu -d www.delogischepartij.eu
# certbot certonly --nginx -d stemdlp.nl -d www.stemdlp.nl -d stemdlp.eu -d www.stemdlp.eu

echo "Server directories created. Run certbot commands manually for SSL certificates."
REMOTE
