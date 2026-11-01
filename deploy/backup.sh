#!/usr/bin/env bash
# Copies the database to /data/backups inside the app's volume and keeps the last 14 days.
# Runs daily from cron (installed by setup.sh). Run it by hand any time: sudo ./deploy/backup.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
STAMP="$(date +%Y-%m-%d)"
docker compose exec -T app node --disable-warning=ExperimentalWarning -e "
  const fs = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync('/data/backups', { recursive: true });
  const target = '/data/backups/theplanner-${STAMP}.db';
  fs.rmSync(target, { force: true });
  new DatabaseSync('/data/theplanner.db').exec(\"VACUUM INTO '\" + target + \"'\");
  const files = fs.readdirSync('/data/backups').filter(f => f.endsWith('.db')).sort();
  for (const f of files.slice(0, -14)) fs.rmSync('/data/backups/' + f);
  console.log('Backup written:', target);
"
