# 02-sync-agent-rules.ps1 — verify the file-driven agent tools will auto-load Protean's laws.
# These files ARE the "import" for Cursor and Claude Code — no paste needed for those tools.
# This script does NOT rewrite the laws (single source of truth); it verifies presence and
# reports exactly what each tool reads and from where.
#
#   pwsh -File .\02-sync-agent-rules.ps1

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo
$root = Get-RepoRoot

Write-Step "Agent rule files — what each tool auto-loads"

$map = @(
    [pscustomobject]@{ Tool='Cursor (classic)';  File='.cursorrules';                Why='Auto-loaded from repo root on every edit.' }
    [pscustomobject]@{ Tool='Cursor (modern)';    File='.cursor\rules\protean.mdc';  Why='alwaysApply rule for newer Cursor versions.' }
    [pscustomobject]@{ Tool='Claude Code / SDK';  File='CLAUDE.md';                   Why='Auto-read when this repo is the working dir.' }
    [pscustomobject]@{ Tool='Any AI agent';       File='AGENTS.md';                   Why='Canonical operating contract + the 8 laws.' }
)

$allPresent = $true
foreach ($m in $map) {
    $p = Join-Path $root $m.File
    if (Test-Path $p) { Write-Ok  "$($m.Tool.PadRight(20)) reads  $($m.File)   — $($m.Why)" }
    else              { Write-Fail "$($m.Tool.PadRight(20)) MISSING $($m.File)"; $allPresent = $false }
}

Write-Step "Paste-only tools (cannot be scripted — no file import exists)"
Write-Info2 "Claude Desktop Project  → paste project-briefs\CLAUDE_DESKTOP_PROJECT.md into the project's instructions."
Write-Info2 "ChatGPT Project         → paste project-briefs\CHATGPT_PROJECT.md into the project's instructions."
Write-Info2 "Use 03-load-brief.ps1 to copy either brief straight to your clipboard."

Write-Step "Result"
if ($allPresent) { Write-Ok "All file-driven tools are wired. Open the repo in Cursor / Claude Code and the laws load automatically."; exit 0 }
else { Write-Fail "One or more rule files are missing — restore them before relying on auto-load."; exit 1 }
