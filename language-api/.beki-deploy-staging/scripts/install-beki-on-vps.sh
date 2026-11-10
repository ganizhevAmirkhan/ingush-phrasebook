#!/usr/bin/env bash
# VPS: установить Сыновья Беки из beki-deploy.zip
#   cd /opt/ingush/ingush-phrasebook-main/language-api
#   bash scripts/install-beki-on-vps.sh beki-deploy.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ZIP="${1:-beki-deploy.zip}"

if [[ ! -f "$ZIP" ]]; then
  echo "Нет $ZIP. Залейте beki-deploy.zip в $ROOT"
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

unzip -qo "$ZIP" -d "$TMP"
TREE="$TMP"
if [[ -d "$TMP/.beki-deploy-staging" ]]; then
  TREE="$TMP/.beki-deploy-staging"
fi

mkdir -p data/corpus/stories data/colloquial data/workbench public/tools/seed src scripts

copy_if() {
  local rel="$1"
  if [[ -f "$TREE/$rel" ]]; then
    mkdir -p "$(dirname "$rel")"
    cp -f "$TREE/$rel" "$rel"
    echo "  + $rel"
  fi
}

echo "== Copy files =="
copy_if "data/corpus/stories/synovya-beki.json"
copy_if "data/colloquial/story_synovya_beki_001-workbench-phrases.json"
copy_if "data/workbench/synovya-beki.workbench.json"
copy_if "src/schema.js"
copy_if "src/platform.js"
copy_if "server.js"
copy_if "public/tools/corpus-align.html"
copy_if "public/tools/corpus-align.js"
copy_if "public/tools/corpus-align.css"
copy_if "public/tools/seed/synovya-beki.workbench.json"
copy_if "scripts/install-beki-on-vps.sh"

echo "== Restart API =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ingush-language-api --update-env || pm2 restart 0 --update-env || true
else
  echo "pm2 не найден — перезапустите API вручную"
fi

sleep 2
echo "== Refresh =="
curl -s -X POST http://127.0.0.1:8787/refresh -H 'Content-Type: application/json' -d '{}' | head -c 500
echo
echo "== Corpus Беки =="
curl -s 'http://127.0.0.1:8787/lookup/corpus?q=%D0%91%D0%B5%D0%BA%D0%B8' | head -c 600
echo
echo "== Phrase на рассвете =="
curl -s 'http://127.0.0.1:8787/lookup/phrase?ru=%D0%BD%D0%B0+%D1%80%D0%B0%D1%81%D1%81%D0%B2%D0%B5%D1%82%D0%B5' | head -c 600
echo
echo "Done. Public: https://api.inghub.ru/lookup/corpus?q=Беки"
echo "Tool: https://api.inghub.ru/tools/corpus-align.html"
