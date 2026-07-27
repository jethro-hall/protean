#Requires -Version 5.1
<#
.SYNOPSIS
  Install the official GitHub MCP server into Claude Desktop (Windows).

.DESCRIPTION
  Merges mcpServers.github (Docker + OAuth) into Claude Desktop config(s).
  Writes both the documented %APPDATA% path and the MSIX-virtualized path when
  present (Edit Config often opens a file the app does not read).

.PARAMETER UsePat
  If set, configure PAT auth instead of OAuth. Pass -GitHubPat or set env
  GITHUB_PERSONAL_ACCESS_TOKEN. Prefer OAuth; do not commit PATs.

.PARAMETER GitHubPat
  Personal access token (only with -UsePat). Prefer env var over this flag.
#>
[CmdletBinding()]
param(
  [switch]$UsePat,
  [string]$GitHubPat = $env:GITHUB_PERSONAL_ACCESS_TOKEN
)

$ErrorActionPreference = 'Stop'

function Get-ClaudeConfigPaths {
  $paths = New-Object System.Collections.Generic.List[string]
  $appData = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
  $paths.Add($appData) | Out-Null

  $msixRoot = Join-Path $env:LOCALAPPDATA 'Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude'
  if (Test-Path $msixRoot) {
    $paths.Add((Join-Path $msixRoot 'claude_desktop_config.json')) | Out-Null
  }
  return $paths
}

function Get-GithubMcpServer {
  param([switch]$PatMode, [string]$Pat)

  if ($PatMode) {
    if ([string]::IsNullOrWhiteSpace($Pat)) {
      throw 'PAT mode requires -GitHubPat or env GITHUB_PERSONAL_ACCESS_TOKEN'
    }
    return [ordered]@{
      command = 'docker'
      args    = @(
        'run', '-i', '--rm',
        '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN',
        'ghcr.io/github/github-mcp-server'
      )
      env     = [ordered]@{
        GITHUB_PERSONAL_ACCESS_TOKEN = $Pat
      }
    }
  }

  return [ordered]@{
    command = 'docker'
    args    = @(
      'run', '-i', '--rm',
      '-p', '127.0.0.1:8085:8085',
      '-e', 'GITHUB_OAUTH_CALLBACK_PORT',
      'ghcr.io/github/github-mcp-server'
    )
    env     = [ordered]@{
      GITHUB_OAUTH_CALLBACK_PORT = '8085'
    }
  }
}

function Merge-GithubServer {
  param(
    [string]$ConfigPath,
    [hashtable]$GithubServer
  )

  $dir = Split-Path -Parent $ConfigPath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $config = [ordered]@{ mcpServers = [ordered]@{} }
  if (Test-Path $ConfigPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item -LiteralPath $ConfigPath -Destination "$ConfigPath.bak-$stamp" -Force
    $raw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
      $parsed = $raw | ConvertFrom-Json
      # Preserve unknown top-level keys by re-serializing through PSCustomObject round-trip
      $config = $parsed
      if (-not $config.mcpServers) {
        $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force
      }
    }
  }

  # Convert mcpServers to a mutable hashtable-like object
  $servers = @{}
  if ($config.mcpServers) {
    $config.mcpServers.PSObject.Properties | ForEach-Object {
      $servers[$_.Name] = $_.Value
    }
  }
  $servers['github'] = $GithubServer

  $out = [ordered]@{}
  if ($config -is [System.Management.Automation.PSCustomObject]) {
    $config.PSObject.Properties | ForEach-Object {
      if ($_.Name -ne 'mcpServers') { $out[$_.Name] = $_.Value }
    }
  }
  $out['mcpServers'] = $servers

  $json = $out | ConvertTo-Json -Depth 20
  # UTF-8 without BOM — Claude Desktop is picky about encoding on some builds
  [System.IO.File]::WriteAllText($ConfigPath, $json + "`n")
  Write-Host "Wrote $ConfigPath"
}

Write-Host '=== GitHub MCP → Claude Desktop ==='

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Warning 'Docker not found on PATH. Install Docker Desktop and re-run after it is running.'
} else {
  try {
    docker info 1>$null 2>$null
    Write-Host 'Pulling ghcr.io/github/github-mcp-server …'
    docker pull ghcr.io/github/github-mcp-server
  } catch {
    Write-Warning "Docker pull skipped/failed: $_. Start Docker Desktop, then: docker pull ghcr.io/github/github-mcp-server"
  }
}

$github = Get-GithubMcpServer -PatMode:$UsePat -Pat $GitHubPat
$paths = Get-ClaudeConfigPaths
foreach ($p in $paths) {
  Merge-GithubServer -ConfigPath $p -GithubServer $github
}

Write-Host ''
Write-Host 'Done. Next:'
Write-Host '  1. Quit Claude Desktop fully (system tray → Quit).'
Write-Host '  2. Ensure Docker Desktop is running.'
Write-Host '  3. Re-open Claude Desktop.'
if (-not $UsePat) {
  Write-Host '  4. First GitHub tool use will open a browser OAuth login — approve it.'
}
Write-Host ''
Write-Host 'Docs: docs/GITHUB_MCP_CLAUDE_DESKTOP.md'
