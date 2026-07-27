# GitHub MCP for Claude Desktop (Windows)

Official server: [`github/github-mcp-server`](https://github.com/github/github-mcp-server).
Claude Desktop needs the **local Docker** setup (remote GitHub MCP OAuth via Connectors is not supported yet).

## Prerequisites (on the machine that runs Claude Desktop)

1. **Claude Desktop** (latest)
2. **Docker Desktop** installed and **running**
3. A GitHub account (OAuth login on first use — no PAT required for the default install)

## One-shot install (recommended)

In **PowerShell** on your Windows PC (not on this EC2):

```powershell
cd "G:\CLAUDE DATA\protean"   # or wherever you cloned protean
powershell -ExecutionPolicy Bypass -File .\scripts\install-github-mcp-claude-desktop.ps1
```

Then:

1. Fully **quit** Claude Desktop (tray icon → Quit)
2. Start **Docker Desktop** and wait until it is healthy
3. Re-open Claude Desktop
4. First GitHub tool call should open a browser login (OAuth). Approve it.

## What the script does

- Prefetches `ghcr.io/github/github-mcp-server`
- Merges a `github` entry into `mcpServers` (does not wipe other MCP servers)
- Writes to **both** Windows config locations (MSIX installs often ignore the path Edit Config opens):
  - `%APPDATA%\Claude\claude_desktop_config.json`
  - `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` (if present)
- Backs up each file to `*.bak-<timestamp>` before writing

## Manual config (OAuth — preferred)

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-p",
        "127.0.0.1:8085:8085",
        "-e",
        "GITHUB_OAUTH_CALLBACK_PORT",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_OAUTH_CALLBACK_PORT": "8085"
      }
    }
  }
}
```

## PAT alternative (only if OAuth fails)

Create a fine-grained or classic PAT with `repo` (and whatever else you need), then use:

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_PAT"
      }
    }
  }
}
```

**Never commit** a config that contains a real PAT. Revoke immediately if leaked.

## Verify

- Claude Desktop → Settings → Developer — `github` should appear under MCP servers
- Ask Claude: “List my open PRs on jethro-hall/protean”
- Logs (Windows): `%APPDATA%\Claude\logs\` → `mcp-server-*.log`

## Why this can’t be finished from the EC2 Cursor host

Claude Desktop reads config on **your desktop OS**. This Amazon Linux session can prepare scripts and docs only; you must run the PowerShell installer (or paste the JSON) on the Windows machine where Claude Desktop is installed.
