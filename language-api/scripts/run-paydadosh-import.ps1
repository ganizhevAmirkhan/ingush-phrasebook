$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Remove-Item Env:PD_IMPORT_LIMIT -ErrorAction SilentlyContinue

$log = Join-Path $PSScriptRoot "paydadosh-import.log"

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line
  Write-Output $line
}

Log "=== PHASE 1: phrases ==="
node scripts/import-paydadosh.js --phrases-only
if ($LASTEXITCODE -ne 0) { Log "PHASE 1 failed exit $LASTEXITCODE"; exit $LASTEXITCODE }

Log "=== PHASE 2: proverbs ==="
node scripts/import-paydadosh.js --proverbs-only
if ($LASTEXITCODE -ne 0) { Log "PHASE 2 failed exit $LASTEXITCODE"; exit $LASTEXITCODE }

Log "=== DONE ==="
