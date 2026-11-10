# Залить Сыновья Беки (story + phrases + workbench loader) на VPS.
# Нужен пароль: $env:VPS_PASSWORD = "..."
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/deploy-beki-vps.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Host_ = if ($env:VPS_HOST) { $env:VPS_HOST } else { "root@193.233.103.150" }
$HostKey = if ($env:VPS_HOSTKEY) { $env:VPS_HOSTKEY } else { "ssh-ed25519 255 SHA256:W5W+G+3EgCGgpG82rQCo3Se3SaL5fqPPlm3J0NduBmg" }
$Remote = "/opt/ingush/ingush-phrasebook-main/language-api"
$Pscp = "C:\Program Files\PuTTY\pscp.exe"
$Plink = "C:\Program Files\PuTTY\plink.exe"

if (-not (Test-Path $Pscp)) { throw "Нет PuTTY pscp" }
if (-not (Test-Path $Plink)) { throw "Нет PuTTY plink" }
if (-not $env:VPS_PASSWORD) { throw "Задайте `$env:VPS_PASSWORD перед запуском" }

function Upload($localRel, $remoteRel) {
  $local = Join-Path $Root $localRel
  if (-not (Test-Path $local)) { throw "Нет файла $local" }
  Write-Host "==> $localRel -> $remoteRel"
  & $Pscp -batch -hostkey $HostKey -pw $env:VPS_PASSWORD $local "${Host_}:${Remote}/$remoteRel"
  if ($LASTEXITCODE -ne 0) { throw "pscp failed: $localRel" }
}

# данные
Upload "data\corpus\stories\synovya-beki.json" "data/corpus/stories/synovya-beki.json"
Upload "data\colloquial\story_synovya_beki_001-workbench-phrases.json" "data/colloquial/story_synovya_beki_001-workbench-phrases.json"
Upload "data\workbench\synovya-beki.workbench.json" "data/workbench/synovya-beki.workbench.json"

# код, чтобы VPS подхватывал *-workbench-phrases.json
Upload "src\schema.js" "src/schema.js"
Upload "src\platform.js" "src/platform.js"

# UI инструмента (опционально)
& $Plink -batch -hostkey $HostKey -pw $env:VPS_PASSWORD $Host_ "mkdir -p $Remote/public/tools/seed $Remote/data/workbench"
Upload "public\tools\corpus-align.html" "public/tools/corpus-align.html"
Upload "public\tools\corpus-align.js" "public/tools/corpus-align.js"
Upload "public\tools\corpus-align.css" "public/tools/corpus-align.css"
Upload "public\tools\seed\synovya-beki.workbench.json" "public/tools/seed/synovya-beki.workbench.json"
Upload "server.js" "server.js"

Write-Host "== Restart + refresh =="
$cmd = @"
cd $Remote && \
pm2 restart ingush-language-api --update-env && \
sleep 3 && \
curl -s -X POST http://127.0.0.1:8787/refresh -H 'Content-Type: application/json' -d '{}' | head -c 400 && echo && \
curl -s 'http://127.0.0.1:8787/lookup/corpus?q=%D0%91%D0%B5%D0%BA%D0%B8' | head -c 500 && echo && \
curl -s 'http://127.0.0.1:8787/lookup/phrase?ru=%D0%BD%D0%B0+%D1%80%D0%B0%D1%81%D1%81%D0%B2%D0%B5%D1%82%D0%B5' | head -c 500 && echo
"@
& $Plink -batch -hostkey $HostKey -pw $env:VPS_PASSWORD $Host_ $cmd
if ($LASTEXITCODE -ne 0) { throw "plink failed" }

Write-Host "Done. Check https://api.inghub.ru/lookup/corpus?q=Беки"
