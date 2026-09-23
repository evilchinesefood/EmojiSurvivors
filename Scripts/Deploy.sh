#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 022
extra=(--dry-run)
if [[ "${1:-}" == "--live" ]]; then extra=(); elif [[ "${1:-}" != "" ]]; then echo "Usage: $0 [--live]" >&2; exit 2; fi
npm test
npm run test:security
# No deletion: local licensed assets may be absent. Never sync private secrets or live stores.
rsync -rlptz --delay-updates --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  --exclude='/.git/' --exclude='/node_modules/' --exclude='/Tests/' --exclude='/Scripts/' \
  --exclude='/Api/Secret.php' --exclude='/Api/Secret.example.php' --exclude='/Api/*.json' \
  --exclude='/README.md' --exclude='/package*.json' --exclude='/.npmrc*' \
  --exclude='/.gitignore' --exclude='/.prettierignore' \
  "${extra[@]}" -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15' \
  ./ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/survivors/
