# common.ps1 — shared helpers for every Protean rollout script.
# Dot-source this at the top of each script:  . "$PSScriptRoot\lib\common.ps1"
# No hardcoded absolute paths: the repo root is derived from this file's own location.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- repo root ---------------------------------------------------------------
# This file lives at <repo>\scripts\lib\common.ps1  →  root is two levels up.
$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Get-RepoRoot { return $script:RepoRoot }

# --- console helpers ---------------------------------------------------------
function Write-Step   ($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok     ($m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Write-Warn2  ($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Fail   ($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Write-Info2  ($m) { Write-Host "  [..]   $m" -ForegroundColor Gray }

# --- tool detection ----------------------------------------------------------
function Test-Command ($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# --- git lock workaround (this repo lives on a FUSE mount that denies rm on ---
#     lock files but ALLOWS mv). Move any stale *.lock aside before a git op.  --
function Clear-GitLocks {
    $gitDir = Join-Path (Get-RepoRoot) '.git'
    if (-not (Test-Path $gitDir)) { return }
    $locks = Get-ChildItem -Path $gitDir -Recurse -Filter '*.lock' -File -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -notlike '*.moved*' }
    foreach ($l in $locks) {
        $dest = "$($l.FullName).moved.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
        try { Move-Item -LiteralPath $l.FullName -Destination $dest -Force; Write-Info2 "moved stale lock: $($l.Name)" }
        catch {
            try { Remove-Item -LiteralPath $l.FullName -Force; Write-Info2 "removed stale lock: $($l.Name)" }
            catch { Write-Warn2 "could not clear lock $($l.FullName): $($_.Exception.Message)" }
        }
    }
}

# --- run git with locks pre-cleared; returns $true on exit 0 -----------------
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]] $GitArgs)
    Clear-GitLocks
    Push-Location (Get-RepoRoot)
    try {
        & git @GitArgs
        return ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }
}

# --- copy text to clipboard (paste-only tools) -------------------------------
function Set-ClipboardText ($text) {
    if (Test-Command 'Set-Clipboard') { $text | Set-Clipboard; return $true }
    try { $text | clip.exe; return $true } catch { return $false }
}

function Assert-InsideRepo {
    if (-not (Test-Path (Join-Path (Get-RepoRoot) 'AGENTS.md'))) {
        throw "AGENTS.md not found under $(Get-RepoRoot). Run these scripts from the protean\scripts folder."
    }
}
