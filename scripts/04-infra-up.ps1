# 04-infra-up.ps1 — bring up the non-app estate (Postgres+pgvector, Redis) via the one compose.
# Honours Law 2 (no secrets baked in): requires infra\.env to exist (copied from .env.example).
# Does NOT invent a password — it makes you set one.
#
#   pwsh -File .\04-infra-up.ps1            # up -d protean-pg protean-cache
#   pwsh -File .\04-infra-up.ps1 -Down      # stop the stack
#   pwsh -File .\04-infra-up.ps1 -Status    # ps only

param(
    [switch] $Down,
    [switch] $Status
)

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo
$root    = Get-RepoRoot
$infra   = Join-Path $root 'infra'
$compose = Join-Path $infra 'docker-compose.yml'
$envFile = Join-Path $infra '.env'
$envEx   = Join-Path $infra '.env.example'

Write-Step "Protean infra (docker compose)"

if (-not (Test-Command 'docker')) { Write-Fail 'Docker not found. Install Docker Desktop, then re-run.'; exit 1 }
if (-not (Test-Path $compose))    { Write-Fail "Compose file missing: infra\docker-compose.yml"; exit 1 }

Push-Location $infra
try {
    if ($Status) { & docker compose ps; exit $LASTEXITCODE }
    if ($Down)   { Write-Info2 'Stopping stack...'; & docker compose down; exit $LASTEXITCODE }

    # .env gate — Law 2 / secret hygiene.
    if (-not (Test-Path $envFile)) {
        Write-Warn2 "infra\.env not found. Creating it from .env.example — you MUST set a real PG_PASSWORD."
        Copy-Item $envEx $envFile
        Write-Info2 "Edit infra\.env, replace PG_PASSWORD=change-me, then re-run 04-infra-up."
        exit 1
    }
    if ((Get-Content $envFile -Raw) -match 'PG_PASSWORD\s*=\s*change-me') {
        Write-Fail "PG_PASSWORD is still 'change-me' in infra\.env. Set a real password first (never commit it)."
        exit 1
    }

    Write-Info2 'Pulling + starting protean-pg and protean-cache...'
    & docker compose up -d protean-pg protean-cache
    if ($LASTEXITCODE -ne 0) { Write-Fail 'compose up failed.'; exit 1 }

    Start-Sleep -Seconds 3
    Write-Step "Health"
    & docker compose ps
    Write-Info2 "Wait for both to report healthy (healthcheck interval 10s). Then Phase 2 wires the app to them."
    exit 0
} finally { Pop-Location }
