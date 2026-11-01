#!/usr/bin/env bash
# Installs and starts ThePlanner on a fresh Ubuntu server (made for Oracle Cloud Always Free).
# Run from the repository folder:   sudo ./deploy/setup.sh
# Optional: DOMAIN=planner.example.com EMAIL=you@example.com sudo -E ./deploy/setup.sh
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run this with sudo: sudo ./deploy/setup.sh"
command -v apt-get >/dev/null || fail "This script expects Ubuntu. Create the VM with an Ubuntu image."

# 1. Docker
if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || fail "Docker Compose isn't available after installing Docker."
systemctl enable --now docker >/dev/null

# 2. Swap, so the build fits on small VMs (1 GB AMD micro instances)
if [ "$(free -m | awk '/^Mem:/ {print $2}')" -lt 3000 ] && ! swapon --show | grep -q .; then
  say "Adding 2 GB of swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 3. Open ports 80 and 443 in the VM's own firewall (Oracle's Ubuntu images block them)
say "Opening ports 80 and 443 in the server firewall"
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport "$port" -j ACCEPT
done
iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true; fi

# 4. Address and email
PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi
if [ -z "${DOMAIN:-}" ]; then
  [ -n "$PUBLIC_IP" ] || fail "Couldn't find this server's public IP. Run again with DOMAIN=your.domain."
  DEFAULT_DOMAIN="${PUBLIC_IP//./-}.sslip.io"
  read -r -p "Web address [${DEFAULT_DOMAIN}]: " DOMAIN </dev/tty || true
  DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
fi
if [ -z "${EMAIL:-}" ]; then
  read -r -p "Your email (for the HTTPS certificate): " EMAIL </dev/tty || true
  [ -n "$EMAIL" ] || fail "An email address is needed for the HTTPS certificate."
fi
printf 'DOMAIN=%s\nEMAIL=%s\n' "$DOMAIN" "$EMAIL" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 5. Build and start
say "Building and starting ThePlanner (the first build takes a few minutes)"
cd "$DEPLOY_DIR"
docker compose up -d --build

# 6. Daily backups at 03:15
say "Scheduling daily database backups"
chmod +x "$DEPLOY_DIR/backup.sh" "$DEPLOY_DIR/update.sh"
echo "15 3 * * * root $DEPLOY_DIR/backup.sh >> /var/log/theplanner-backup.log 2>&1" > /etc/cron.d/theplanner-backup

# 7. Wait for HTTPS
say "Waiting for https://${DOMAIN} (getting the certificate can take a minute)"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    printf '\n\033[1;32mThePlanner is live at https://%s\033[0m\n' "$DOMAIN"
    printf 'Open it, create your account, then turn on notifications in Settings.\n'
    exit 0
  fi
  sleep 5
done
printf '\n\033[1;33mThe app is running, but https://%s did not answer yet.\033[0m\n' "$DOMAIN"
printf 'Check that ports 80 and 443 are open in the Oracle security list (see DEPLOY.md), then run:\n'
printf '  cd %s && sudo docker compose logs caddy\n' "$DEPLOY_DIR"
