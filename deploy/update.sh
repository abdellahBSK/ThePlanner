#!/usr/bin/env bash
# Pulls the latest code and restarts ThePlanner with it. Your data is kept.
# Usage: sudo ./deploy/update.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
git -C .. pull --ff-only
./backup.sh || echo "Backup skipped (the app may not be running)."
docker compose up -d --build
docker image prune -f >/dev/null
echo "ThePlanner is updated."
