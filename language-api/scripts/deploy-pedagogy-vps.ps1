# Залить pedagogy на VPS (PuTTY pscp/plink).
# Двойной клик или: powershell -ExecutionPolicy Bypass -File scripts/deploy-pedagogy-vps.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Host_ = if ($env:VPS_HOST) { $env:VPS_HOST } else { "root@193.233.103.150" }
$HostKey = if ($env:VPS_HOSTKEY) { $env:VPS_HOSTKEY } else { "ssh-ed25519 255 SHA256:W5W+G+3EgCGgpG82rQCo3Se3SaL5fqPPlm3J0NduBmg" }
$Remote = "/opt/ingush/ingush-phrasebook-main/language-api"
$Zip = Join-Path $Root "pedagogy-deploy.zip"
$Pscp = "C:\Program Files\PuTTY\pscp.exe"
$Plink = "C:\Program Files\PuTTY\plink.exe"

if (-not (Test-Path $Zip)) {
  node scripts/package-pedagogy-deploy.js
}
if (-not (Test-Path $Zip)) { throw "Нет $Zip" }
if (-not (Test-Path $Pscp)) { throw "Нет PuTTY pscp: $Pscp" }
if (-not (Test-Path $Plink)) { throw "Нет PuTTY plink: $Plink" }

Write-Host "== Upload $Zip -> $Host_:$Remote =="
if ($env:VPS_PASSWORD) {
  & $Pscp -batch -hostkey $HostKey -pw $env:VPS_PASSWORD $Zip "${Host_}:${Remote}/pedagogy-deploy.zip"
} else {
  & $Pscp -batch -hostkey $HostKey $Zip "${Host_}:${Remote}/pedagogy-deploy.zip"
}
if ($LASTEXITCODE -ne 0) { throw "pscp failed ($LASTEXITCODE). Задайте `$env:VPS_PASSWORD или залейте zip вручную через WinSCP." }

Write-Host "== Install on VPS =="
$cmd = "cd $Remote && bash scripts/install-pedagogy-on-vps.sh pedagogy-deploy.zip"
if ($env:VPS_PASSWORD) {
  & $Plink -batch -hostkey $HostKey -pw $env:VPS_PASSWORD $Host_ $cmd
} else {
  & $Plink -batch -hostkey $HostKey $Host_ $cmd
}

Write-Host "== Check API =="
node scripts/check-vps.js https://api.inghub.ru
Write-Host "Done."
