param(
  [Parameter(Mandatory=$true)]
  [string[]]$Databases,

  [string]$HostName = $env:PGHOST,
  [string]$Port = $env:PGPORT,
  [string]$UserName = $env:PGUSER,
  [string]$MigrationFile = "$(Resolve-Path "$PSScriptRoot\..\migrations\20260109_whatsapp_inbox_mvp.sql")"
)

if (-not (Test-Path $MigrationFile)) {
  throw "Migration file not found: $MigrationFile"
}

foreach ($db in $Databases) {
  Write-Host "==> Migrating $db" -ForegroundColor Cyan
  $cmd = @(
    "psql",
    "-v", "ON_ERROR_STOP=1",
    "-d", $db,
    "-f", $MigrationFile
  )

  if ($HostName) { $cmd += @("-h", $HostName) }
  if ($Port)     { $cmd += @("-p", $Port) }
  if ($UserName) { $cmd += @("-U", $UserName) }

  & $cmd
  if ($LASTEXITCODE -ne 0) {
    throw "Migration failed for $db (exit code $LASTEXITCODE)"
  }
}

Write-Host "Done." -ForegroundColor Green
