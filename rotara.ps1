param(
    [Parameter(Position = 0)]
    [ValidateSet("setup", "build", "start", "dev", "test")]
    [string]$Command = "start"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path "C:\nvm4w\nodejs")) {
    $env:PATH = "C:\nvm4w\nodejs;$env:PATH"
}
& node (Join-Path $PSScriptRoot "scripts\rotara.mjs") $Command
exit $LASTEXITCODE
