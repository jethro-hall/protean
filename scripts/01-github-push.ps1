# 01-github-push.ps1 - put the repo live on GitHub (your chosen flow: you create the
# empty PRIVATE repo on github.com, this script wires the remote and pushes main).
#
# Safe to re-run: if 'origin' already exists it is reused/updated, not duplicated.
#
#   pwsh -File .\01-github-push.ps1 -RemoteUrl https://github.com/<you>/protean.git
#   pwsh -File .\01-github-push.ps1            (will prompt for the URL)

param(
    [string] $RemoteUrl,
    [string] $Branch = 'main'
)

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo

Write-Step "Push Protean to GitHub"

if (-not (Test-Command 'git')) { Write-Fail 'git not found - run 00-preflight first.'; exit 1 }

# 1. Secret guard - never push the egress-patched config or any .env.
#    Check what git actually TRACKS (that's what would be pushed), not the filesystem.
Write-Step "Secret guard (pre-push)"
$tracked = @((& git -C (Get-RepoRoot) ls-files) 2>$null)
$leaks = @($tracked | Where-Object {
    $_ -match '(^|/)\.env$' -or
    $_ -match '\.env$'      -or
    $_ -match '(^|/)claude_desktop_config.*\.json$'
})
if ($leaks) {
    Write-Fail "These secret-bearing files are TRACKED by git and would be pushed:"
    $leaks | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
    Write-Fail "Aborting. Add them to .gitignore and 'git rm --cached' them first."
    exit 1
}
Write-Ok "No secret files are tracked. (.env / claude_desktop_config*.json are gitignored.)"

# 2. Ensure identity exists (local scope only).
if (-not (& git -C (Get-RepoRoot) config user.email)) { & git -C (Get-RepoRoot) config user.email 'jhall.qld@gmail.com' }
if (-not (& git -C (Get-RepoRoot) config user.name))  { & git -C (Get-RepoRoot) config user.name  'Jeff Hall' }

# 3. Get the remote URL.
if (-not $RemoteUrl) {
    Write-Info2 "Create an EMPTY private repo on github.com (no README/licence), then paste its URL."
    $RemoteUrl = Read-Host "Remote URL (e.g. https://github.com/<you>/protean.git)"
}
if ([string]::IsNullOrWhiteSpace($RemoteUrl)) { Write-Fail 'No remote URL given.'; exit 1 }

# 4. Wire the remote (idempotent).
$existing = (& git -C (Get-RepoRoot) remote) 2>$null
if ($existing -contains 'origin') {
    Invoke-Git remote set-url origin $RemoteUrl | Out-Null
    Write-Ok "Updated existing 'origin' -> $RemoteUrl"
} else {
    Invoke-Git remote add origin $RemoteUrl | Out-Null
    Write-Ok "Added 'origin' -> $RemoteUrl"
}

# 5. Rename branch to $Branch and push with upstream tracking.
Invoke-Git branch -M $Branch | Out-Null
Write-Step "Pushing '$Branch' to origin (you may be prompted to authenticate)"
if (Invoke-Git push -u origin $Branch) {
    Write-Ok "Pushed. Repo is live at: $($RemoteUrl -replace '\.git$','')"
    Write-Info2 "Next: run 02-sync-agent-rules (if not already), then open in Cursor and paste the Claude Desktop / ChatGPT briefs via 03-load-brief."
    exit 0
} else {
    Write-Fail "Push failed. Common causes: repo not created yet, wrong URL, or auth needed."
    Write-Info2 "Fix and re-run - the remote is already set, so just: pwsh -File .\01-github-push.ps1 -RemoteUrl $RemoteUrl"
    exit 1
}
