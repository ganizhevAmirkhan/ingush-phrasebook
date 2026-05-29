#!/bin/bash
# Синхронизация VPS с GitHub + перезагрузка API.
# На VPS правки categories делайте на ПК и push — здесь только pull.
set -euo pipefail
cd /opt/ingush/ingush-phrasebook-main

echo "==> Сброс локальных изменений (логи, blacklist, categories с VPS)"
git checkout -- \
  language-api/data/moderation-queue.log.jsonl \
  language-api/data/blacklist.json \
  categories/basic_phrases.json \
  categories/conversation.json \
  2>/dev/null || true

echo "==> git pull"
git pull

echo "==> pm2 restart"
pm2 restart ingush-language-api --update-env
sleep 25

echo "==> refresh + pullCategories"
curl -s -X POST http://127.0.0.1:8787/refresh \
  -H "Content-Type: application/json" \
  -d '{"pullCategories":true}'
echo

echo "==> metrics (фрагмент)"
curl -s http://127.0.0.1:8787/metrics | head -c 1200
echo

echo "==> тест перевода"
curl -s -X POST http://127.0.0.1:8787/translate \
  -H "Content-Type: application/json" \
  -d '{"ru":"я хотел сказать"}'
echo
