# 02-sync-agent-rules.ps1 - verify the file-driven agent tools will auto-load Protean's laws.
# These files ARE the "import" for Cursor and Claude Code - no paste needed for those tools.
# This script does NOT rewrite the laws (single source of truth); it verifies presence and
# reports exactly what each tool reads and from where.
#
#   pwsh -File .\02-sync-agent-rules.ps1

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo
$root = Get-RepoRoot

Write-Step "Agent rule files - what each tool auto-loads"

$map = @(
    [pscustomobject]@{ Tool='Cursor (classic)';  File='.cursorrules';                Why='Auto-loaded from repo root on every edit.' }
    [pscustomobject]@{ Tool='Cursor (modern)';    File='.cursor\rules\protean.mdc';  Why='alwaysApply rule for newer Cursor versions.' }
    [pscustomobject]@{ Tool='Claude Code / SDK';  File='CLAUDE.md';                   Why='Auto-read when this repo is the working dir.' }
    [pscustomobject]@{ Tool='Any AI agent';       File='AGENTS.md';                   Why='Canonical operating contract + the 8 laws.' }
)

$allPresent = $true
foreach ($m in $map) {
    $p = Join-Path $root $m.File
    if (Test-Path $p) { Write-Ok  "$($m.Tool.PadRight(20)) reads  $($m.File)   - $($m.Why)" }
    else              { Write-Fail "$($m.Tool.PadRight(20)) MISSING $($m.File)"; $allPresent = $false }
}

Write-Step "Cursor project agents + skills (committed under .cursor/)"
$agentDir = Join-Path $root '.cursor\agents'
$skillDir = Join-Path $root '.cursor\skills'
$agents = @(Get-ChildItem -Path $agentDir -Filter '*.md' -ErrorAction SilentlyContinue)
$skills = @(Get-ChildItem -Path $skillDir -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') })
$rules  = @(Get-ChildItem -Path (Join-Path $root '.cursor\rules') -Filter '*.mdc' -ErrorAction SilentlyContinue)

if ($rules.Count -ge 1)  { Write-Ok  ("rules:  {0} .mdc file(s)" -f $rules.Count) } else { Write-Fail 'rules:  none'; $allPresent = $false }
if ($agents.Count -ge 1) { Write-Ok  ("agents: {0} -> {1}" -f $agents.Count, (($agents | ForEach-Object BaseName) -join ', ')) }
else { Write-Fail 'agents: none under .cursor\agents\'; $allPresent = $false }
if ($skills.Count -ge 1) { Write-Ok  ("skills: {0} -> {1}" -f $skills.Count, (($skills | ForEach-Object Name) -join ', ')) }
else { Write-Fail 'skills: none under .cursor\skills\'; $allPresent = $false }

Write-Step "Paste-only tools (cannot be scripted - no file import exists)"
Write-Info2 "Claude Desktop Project  -> paste project-briefs\CLAUDE_DESKTOP_PROJECT.md into the project's instructions."
Write-Info2 "ChatGPT Project         -> paste project-briefs\CHATGPT_PROJECT.md into the project's instructions."
Write-Info2 "Use 03-load-brief.ps1 to copy either brief straight to your clipboard."

Write-Step "Result"
if ($allPresent) { Write-Ok "All file-driven tools are wired. Open the protean\ folder in Cursor / Claude Code so rules/agents/skills load."; exit 0 }
else { Write-Fail "One or more rule/agent/skill files are missing - restore them before relying on auto-load."; exit 1 }
