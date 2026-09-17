param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)

if (-not $resolvedOutput.StartsWith($projectDirectory, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The backup directory must be inside the Ticketing System project."
}

New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedOutput "csis-ticketing-$timestamp.sql"

Push-Location $projectDirectory
try {
  docker compose exec -T db pg_dump `
    -U csis_dev `
    -d csis_ticketing `
    --clean `
    --if-exists `
    --no-owner `
    --no-privileges | Set-Content -LiteralPath $backupPath -Encoding utf8

  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL backup failed."
  }

  Write-Host "Backup created: $backupPath"
}
finally {
  Pop-Location
}
