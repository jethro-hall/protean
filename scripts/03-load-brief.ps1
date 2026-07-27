# 03-load-brief.ps1 — copy a project brief to the clipboard for the PASTE-ONLY tools.
# Claude Desktop Projects and ChatGPT Projects take instructions through a text box, not a file
# import. This is the honest "import": it puts the exact brief on your clipboard so paste is one key.
#
#   pwsh -File .\03-load-brief.ps1 -Target claude     # Claude Desktop project brief
#   pwsh -File .\03-load-brief.ps1 -Target chatgpt    # ChatGPT project brief
#   pwsh -File .\03-load-brief.ps1 -Target cursor     # Cursor setup notes (reference)
#   pwsh -File .\03-load-brief.ps1                     # lists the choices

param(
    [ValidateSet('claude','chatgpt','cursor')]
    [string] $Target
)

. "$PSScriptRoot\lib\common.ps1"
Assert-InsideRepo
$root = Get-RepoRoot

$briefs = @{
    claude  = 'project-briefs\CLAUDE_DESKTOP_PROJECT.md'
    chatgpt = 'project-briefs\CHATGPT_PROJECT.md'
    cursor  = 'project-briefs\CURSOR_SETUP.md'
}

if (-not $Target) {
    Write-Step "Which brief do you want on your clipboard?"
    Write-Info2 "claude  → Claude Desktop project instructions"
    Write-Info2 "chatgpt → ChatGPT project instructions"
    Write-Info2 "cursor  → Cursor setup reference"
    $Target = Read-Host "Target (claude/chatgpt/cursor)"
}
if (-not $briefs.ContainsKey($Target)) { Write-Fail "Unknown target '$Target'."; exit 1 }

$path = Join-Path $root $briefs[$Target]
if (-not (Test-Path $path)) { Write-Fail "Brief not found: $($briefs[$Target])"; exit 1 }

$text = Get-Content -LiteralPath $path -Raw
if (Set-ClipboardText $text) {
    Write-Ok "Copied '$($briefs[$Target])' to the clipboard ($([math]::Round($text.Length/1KB,1)) KB)."
    switch ($Target) {
        'claude'  { Write-Info2 "Claude Desktop → your Project → Edit → paste into the project instructions box." }
        'chatgpt' { Write-Info2 "ChatGPT → your Project → Instructions → paste." }
        'cursor'  { Write-Info2 "Reference only — Cursor auto-loads .cursorrules; no paste required." }
    }
    exit 0
} else {
    Write-Warn2 "Clipboard copy failed. Open the file and copy manually: $path"
    exit 1
}
