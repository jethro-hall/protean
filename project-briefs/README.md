# Protean — Project Briefs

Portable, self-contained project descriptions so **every surface** working on Protean is on the
identical page. Each file below can be pasted into its tool with no other context and the agent will
know what Protean is, the rules, the confirmed architecture, where the build is, and how to behave.

| File | Paste into |
|---|---|
| `CLAUDE_DESKTOP_PROJECT.md` | Claude Desktop → new Project "Protean" → Custom Instructions / description |
| `CHATGPT_PROJECT.md` | ChatGPT → new Project → Instructions (or a custom GPT system prompt) |
| `CURSOR_SETUP.md` | How to point Cursor at the repo (rules auto-load from `.cursorrules`) |

All three carry the same core: the 8 engineering laws, the confirmed 2026-07-27 architecture
(gateway/proxy, PostgreSQL+pgvector with Qdrant deferred, GPU=compute, Docker common-compose,
session sandbox, mandatory (i) info affordance), the phase order (architect everything now, build
Phase 0 lean first), and the behavioural contract (challenge-before-comply, evidence-or-nothing,
[VERIFY] discipline, browser-verified GUI).

The authoritative deep detail lives in `../docs/` — the briefs are the on-ramp, the docs are the law.
