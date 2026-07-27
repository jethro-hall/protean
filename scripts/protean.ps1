# protean.ps1 — one entry point. Runs the rollout steps in order, or a single step.
#
#   pwsh -File .\protean.ps1              # interactive menu
#   pwsh -File .\protean.ps1 -Step preflight
#   pwsh -File .\protean.ps1 -Step push -RemoteUrl https://github.com/<you>/protean.git
#   pwsh -File .\protean.ps1 -Step rules|brief|infra

param(
    [ValidateSet('preflight','push','rules','brief','infra','all')]
    [string] $Step,
    [string] $RemoteUrl,
    [string] $Target
)

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo

function Run-Step ($s) {
    switch ($s) {
        'preflight' { & "$PSScriptRoot\00-preflight.ps1" }
        'push'      { if ($RemoteUrl) { & "$PSScriptRoot\01-github-push.ps1" -RemoteUrl $RemoteUrl } else { & "$PSScriptRoot\01-github-push.ps1" } }
        'rules'     { & "$PSScriptRoot\02-sync-agent-rules.ps1" }
        'brief'     { if ($Target) { & "$PSScriptRoot\03-load-brief.ps1" -Target $Target } else { & "$PSScriptRoot\03-load-brief.ps1" } }
        'infra'     { & "$PSScriptRoot\04-infra-up.ps1" }
    }
}

if ($Step -and $Step -ne 'all') { Run-Step $Step; exit $LASTEXITCODE }

if ($Step -eq 'all') {
    Write-Step "Full foundation rollout"
    Run-Step 'preflight'; if ($LASTEXITCODE -ne 0) { Write-Fail 'Preflight gaps — stopping.'; exit 1 }
    Run-Step 'rules'
    Run-Step 'push'
    Write-Ok "Foundation steps done. Load the paste-only briefs with:  .\protean.ps1 -Step brief -Target claude"
    exit 0
}

# Interactive menu
Write-Step "Protean rollout"
Write-Host "  1  preflight   — check dev tools (read-only)"
Write-Host "  2  rules       — verify agent rule files auto-load"
Write-Host "  3  push        — put repo live on GitHub"
Write-Host "  4  brief       — copy a Claude/ChatGPT brief to clipboard"
Write-Host "  5  infra       — docker compose up (Postgres+Redis)"
Write-Host "  a  all         — preflight → rules → push"
$c = Read-Host "Choose"
switch ($c) {
    '1' { Run-Step 'preflight' }
    '2' { Run-Step 'rules' }
    '3' { Run-Step 'push' }
    '4' { Run-Step 'brief' }
    '5' { Run-Step 'infra' }
    'a' { & "$PSScriptRoot\protean.ps1" -Step all }
    default { Write-Warn2 'No choice made.' }
}
