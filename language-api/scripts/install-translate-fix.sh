#!/bin/bash
set -euo pipefail
ROOT="/opt/ingush/ingush-phrasebook-main/language-api"
cd "$ROOT"
SRC="${1:-.}"
cp -f "$SRC/src/platform.js" "$ROOT/src/platform.js"
cp -f "$SRC/data/grammar/compose-rules.json" "$ROOT/data/grammar/compose-rules.json"
pm2 restart ingush-language-api --update-env
sleep 3
curl -s -X POST http://127.0.0.1:8787/refresh -H 'Content-Type: application/json' -d '{}' | head -c 300
echo
node -e 'const http=require("http"); const data=Buffer.from(JSON.stringify({ru:"кто я"}),"utf8"); const req=http.request({hostname:"127.0.0.1",port:8787,path:"/translate",method:"POST",headers:{"Content-Type":"application/json","Content-Length":data.length}},res=>{let b="";res.on("data",c=>b+=c);res.on("end",()=>console.log(res.statusCode,b));}); req.write(data); req.end();'
