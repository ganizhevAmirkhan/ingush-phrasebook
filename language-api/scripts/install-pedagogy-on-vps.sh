#!/bin/bash
# VPS: pedagogy deploy без импорта PDF.
#   bash scripts/install-pedagogy-on-vps.sh pedagogy-deploy.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REQUIRED=(
  data/grammar/ozdoev-1970-knowledge.json
  data/grammar/iomabara-praktikum-knowledge.json
  data/grammar/ozdoev-ortography-2003-knowledge.json
  data/grammar/hlanzara-ingush-knowledge.json
  data/corpus/stories/pedagogy_ozdoev_1970.json
  server.js
  src/admin-store.js
  src/platform.js
  src/schema.js
)

ZIP="${1:-pedagogy-deploy.zip}"
if [[ -f "$ZIP" ]]; then
  echo "== Распаковка $ZIP =="
  TMP="$(mktemp -d)"
  unzip -a -q -o "$ZIP" -d "$TMP" || unzip -q -o "$ZIP" -d "$TMP"
  TREE="$TMP"
  if [[ -d "$TMP/.pedagogy-deploy-staging" ]]; then
    TREE="$TMP/.pedagogy-deploy-staging"
  else
    INNER="$(find "$TMP" -name package.json 2>/dev/null | head -1 || true)"
    if [[ -n "$INNER" ]]; then
      TREE="$(dirname "$INNER")"
    fi
  fi
  echo "  from: $TREE"
  if [[ -f "$TREE/package.json" || -f "$TREE/server.js" ]]; then
    cp -a "$TREE"/. "$ROOT"/
  else
    echo "WARN: package.json не найден после unzip"
  fi
  rm -rf "$TMP"
fi

echo "== Проверка =="
MISS=0
for f in "${REQUIRED[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "MISSING: $f"
    MISS=1
  fi
done
if [[ "$MISS" -eq 1 ]]; then
  echo "Залейте pedagogy-deploy.zip с ПК и повторите."
  exit 1
fi

if ! grep -q pedagogyBooks src/admin-store.js 2>/dev/null; then
  echo "ERROR: src/admin-store.js старый (нет pedagogyBooks)."
  exit 1
fi

if [[ -f scripts/import-pedagogy-books.js ]]; then
  node scripts/import-pedagogy-books.js --check || true
fi

echo "== pm2 restart =="
pm2 restart ingush-language-api --update-env
sleep 3

curl -s http://127.0.0.1:8787/health | head -c 180
echo
curl -s http://127.0.0.1:8787/info | python3 -c "import sys,json; d=json.load(sys.stdin); print('pedagogyBooks:', d.get('grammar',{}).get('pedagogyBooks') or 'EMPTY')"
curl -s "http://127.0.0.1:8787/grammar/ozdoev-1970" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ozdoev-1970 ok=', d.get('ok'), 'sections=', len(d.get('sections',[])))"
echo "Готово."
