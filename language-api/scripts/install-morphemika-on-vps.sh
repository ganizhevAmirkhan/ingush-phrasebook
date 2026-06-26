#!/bin/bash
# Run ON VPS after uploading morphemika-deploy.zip to language-api/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ZIP="${1:-morphemika-deploy.zip}"
if [[ ! -f "$ZIP" ]]; then
  echo "Put morphemika-deploy.zip in $ROOT and run: bash scripts/install-morphemika-on-vps.sh"
  exit 1
fi
TMP=$(mktemp -d)
unzip -q "$ZIP" -d "$TMP"
cp -f "$TMP/data/grammar/morphemika-2020-knowledge.json" data/grammar/
cp -f "$TMP/data/grammar/morphemika-2020-affixes.json" data/grammar/
cp -f "$TMP/data/grammar/rules.json" data/grammar/
cp -f "$TMP/server.js" .
cp -f "$TMP/src/admin-store.js" src/
cp -f "$TMP/package.json" .
cp -f "$TMP/admin.js" admin/admin.js
rm -rf "$TMP"
pm2 restart ingush-language-api
sleep 2
curl -s http://127.0.0.1:8787/health | head -c 120
echo
curl -s http://127.0.0.1:8787/info | python3 -c "import sys,json; g=json.load(sys.stdin).get('grammar',{}); print('morphemika sections:', g.get('morphemika2020Sections'))"
curl -s "http://127.0.0.1:8787/grammar/morphemika-2020?section=morph_p072" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('section',{}).get('titleRu', d))"
