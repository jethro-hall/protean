# 00-preflight.ps1 — verify the dev foundation before Phase 0.
# Read-only: checks tools and versions, changes nothing. Reports a PASS/GAP table.
#
#   pwsh -File .\00-preflight.ps1        (or)   powershell -ExecutionPolicy Bypass -File .\00-preflight.ps1

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo

Write-Step "Protean preflight — dev foundation check"
Write-Info2 "Repo root: $(Get-RepoRoot)"

$script:results = [System.Collections.Generic.List[object]]::new()
function Check ($name, $required, [scriptblock] $probe, $hint) {
    $detail = ''
    $ok = $false
    try { $detail = (& $probe); $ok = -not [string]::IsNullOrWhiteSpace($detail) } catch { $ok = $false }
    $script:results.Add([pscustomobject]@{
        Tool = $name; Required = $(if ($required) {'required'} else {'optional'})
        Status = $(if ($ok) {'PASS'} elseif ($required) {'GAP (required)'} else {'absent (optional)'})
        Detail = $(if ($ok) { ($detail | Select-Object -First 1) } else { $hint })
    })
}

Check 'git'    $true  { (git --version) }                        'Install Git for Windows: https://git-scm.com/download/win'
Check 'node'   $true  { (node --version) }                       'Install Node LTS (>=20): https://nodejs.org  — needed for the SDK + Vite'
Check 'npm'    $true  { (npm --version) }                        'Ships with Node.'
Check 'gh'     $false { (gh --version | Select-Object -First 1) } 'Optional GitHub CLI. Not needed for your push flow (you create the repo).'
Check 'docker' $false { (docker --version) }                     'Optional now; needed at infra bring-up (Postgres+Redis). Docker Desktop.'
Check 'pwsh'   $false { ($PSVersionTable.PSVersion.ToString()) } 'PowerShell 7+ recommended, but Windows PowerShell 5.1 works.'
Check 'aws'    $false { (aws --version 2>&1 | Select-Object -First 1) } 'Optional; only for Bedrock model-id lookup + STS. AWS CLI v2.'

$script:results | Format-Table -AutoSize

$gaps = @($script:results | Where-Object { $_.Status -like 'GAP*' })
Write-Step "Node version gate (SDK needs >= 20)"
if (Test-Command 'node') {
    $v = (node --version) -replace '^v',''
    $major = [int]($v.Split('.')[0])
    if ($major -ge 20) { Write-Ok "Node $v OK (>=20)" } else { Write-Warn2 "Node $v is below 20 — upgrade before Phase 0." }
} else { Write-Warn2 "Node not found." }

Write-Step "Result"
if ($gaps) {
    Write-Fail "$($gaps.Count) required tool(s) missing. Install them, then re-run 00-preflight."
    exit 1
} else {
    Write-Ok "All required tools present. Foundation is ready for GitHub + Phase 0."
    exit 0
}
