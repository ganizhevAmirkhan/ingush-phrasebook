#!/bin/bash
# VPS: pedagogy deploy без импорта PDF.
#   bash scripts/install-pedagogy-on-vps.sh
#   bash scripts/install-pedagogy-on-vps.sh pedagogy-deploy.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

declare -a REQUIRED=(
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

copy_from_tree() {
  local tree="$1"
  local rel="$2"
  local base dest src
  base="$(basename "$rel")"
  if [[ -f "$tree/$rel" ]]; then
    src="$tree/$rel"
  elif [[ -f "$tree/$base" ]]; then
    src="$tree/$base"
  else
    src="$(find "$tree" -type f -name "$base" 2>/dev/null | head -1)"
  fi
  if [[ -n "${src:-}" && -f "$src" ]]; then
    mkdir -p "$(dirname "$rel")"
    cp -f "$src" "$rel"
    echo "  + $rel"
    return 0
  fi
  return 1
}

ZIP="${1:-pedagogy-deploy.zip}"
if [[ -f "$ZIP" ]]; then
  echo "== Распаковка $ZIP =="
  TMP=$(mktemp -d)
  unzip -q -o "$ZIP" -d "$TMP"
  TREE="$TMP"
  if [[ -d "$TMP/.pedagogy-deploy-staging" ]]; then
    TREE="$TMP/.pedagogy-deploy-staging"
  elif [[ ! -f "$TMP/package.json" && ! -f "$TMP/server.js" ]]; then
    INNER=$(find "$TMP" -mindepth 1 -maxdepth 2 -name package.json -printf '%h\n' 2>/dev/null | head -1)
    [[ -n "$INNER" ]] && TREE="$INNER"
  fi
  echo "  from: $TREE"
  shopt -s dotglob
  cp -a "$TREE"/* "$ROOT"/
  shopt -u dotglob
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
  echo ""
  echo "Файлы не на месте. На VPS выполните вручную:"
  echo "  unzip -o pedagogy-deploy.zip -d /tmp/ped && cp -a /tmp/ped/.pedagogy-deploy-staging/. . 2>/dev/null || cp -a /tmp/ped/* ."
  exit 1
fi

if ! grep -q pedagogyBooks src/admin-store.js 2>/dev/null; then
  echo "ERROR: src/admin-store.js старый (нет pedagogyBooks). Перезалейте zip."
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
curl -s http://127.0.0.1:8787/info | python3 -c "
import sys,json
d=json.load(sys.stdin)
pb=d.get('grammar',{}).get('pedagogyBooks',{})
print('pedagogyBooks:', pb or 'EMPTY')
"
curl -s "http://127.0.0.1:8787/grammar/ozdoev-1970" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ozdoev-1970 ok=', d.get('ok'), 'sections=', len(d.get('sections',[])))
"
echo "Готово."
