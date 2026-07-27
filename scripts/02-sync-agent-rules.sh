#!/usr/bin/env bash
# Bash twin of 02-sync-agent-rules.ps1 for Linux/macOS (no pwsh required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ok()   { printf 'OK   %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*"; MISSING=1; }
MISSING=0

echo "== Agent rule files =="
check() {
  local tool="$1" file="$2" why="$3"
  if [[ -f "$ROOT/$file" ]]; then ok "$tool reads $file — $why"
  else fail "$tool MISSING $file"; fi
}
check "Cursor (classic)" ".cursorrules" "Auto-loaded from repo root."
check "Cursor (modern)"  ".cursor/rules/protean.mdc" "alwaysApply modern rule."
check "Claude Code/SDK"  "CLAUDE.md" "Auto-read in this working dir."
check "Any AI agent"     "AGENTS.md" "Canonical contract + 8 laws."

echo "== Cursor agents + skills =="
RULE_N=$(find "$ROOT/.cursor/rules" -maxdepth 1 -name '*.mdc' 2>/dev/null | wc -l | tr -d ' ')
AGENT_N=$(find "$ROOT/.cursor/agents" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
SKILL_N=$(find "$ROOT/.cursor/skills" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print 2>/dev/null | wc -l | tr -d ' ')
[[ "$RULE_N"  -ge 1 ]] && ok "rules:  $RULE_N .mdc" || fail "rules: none"
[[ "$AGENT_N" -ge 1 ]] && ok "agents: $AGENT_N under .cursor/agents" || fail "agents: none"
[[ "$SKILL_N" -ge 1 ]] && ok "skills: $SKILL_N under .cursor/skills" || fail "skills: none"

echo "== Result =="
if [[ "$MISSING" -eq 0 ]]; then
  ok "Wired. Open the protean/ folder as the Cursor workspace root."
  exit 0
fi
fail "Restore missing files before relying on auto-load."
exit 1
