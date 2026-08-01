# Protean

> The versatile business associate. One interface that assumes the shape of whatever
> job is in front of it — a CFO's analyst one minute, a doctor's-surgery workflow builder
> the next, a university tutor the minute after.

**Protean** is a lightweight, fast, cross-device (mobile / iPad / desktop) enterprise GUI
that delivers Claude-desktop-grade dynamic workflow capability on top of a
**provider-agnostic LLM engine**. It thinks, generates, and builds live alongside the user
through an interactive preview pane, and it does so leanly — every token, every millisecond,
and every cache hit is engineered.

This repository is the **single source of truth** for the build. It is written to be read by
three audiences at once — the human owner (Jeff), and the AI agents (Claude via the Agent SDK,
and Cursor) that do most of the construction. Any agent must be able to pick up the work cold
from these documents.

---

## Start here (read in this order)

1. **[docs/PROJECT_CHARTER.md](docs/PROJECT_CHARTER.md)** — what we are building and why; the
   non-negotiable engineering laws (including the "no workarounds / nothing hardcoded" rule,
   stated precisely); the multi-domain & SaaS mandate; and an honest red-team of the tensions.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the layered system: 3-pane GUI,
   provider-agnostic LLM gateway, the WatcherLLM optimisation layer, caching/token strategy,
   the live preview pane, logging, and the chosen stack with latency budgets.
3. **[docs/ROADMAP.md](docs/ROADMAP.md)** — the phases. Phase 0 gets us to a measured Claude
   Agent SDK latency spike as fast as possible; later phases build out to the full product.
4. **[AGENTS.md](AGENTS.md)** — the contract every AI agent obeys. Cursor and Claude both read
   this. Mirrored to `.cursorrules`.
5. **[CONTRIBUTING.md](CONTRIBUTING.md)** — GitHub rules: branches, commits, PRs, and the
   mandatory build-log + chat-log discipline.
6. **[docs/CHAT/BUILD_LOG.md](docs/CHAT/BUILD_LOG.md)** — the append-only record of every
   significant design/build change, the user request that prompted it, and the agent response.

## Directory map

```
protean/
├─ README.md                     ← you are here
├─ AGENTS.md                     ← contract for any AI agent (source of truth)
├─ .cursorrules                  ← Cursor's enforced copy of the coding laws
├─ CONTRIBUTING.md               ← GitHub + logging discipline
├─ docs/
│  ├─ PROJECT_CHARTER.md
│  ├─ ARCHITECTURE.md
│  ├─ ROADMAP.md
│  ├─ DECISIONS/                 ← one ADR (Architecture Decision Record) per hard call
│  └─ CHAT/
│     ├─ BUILD_LOG.md            ← append-only: request → change → agent response
│     └─ sessions/               ← full transcripts of build sessions
└─ APP/
   ├─ CODE/          ← all backend logic (agent, gateway, watcher, logging, contracts, config, domains)
   ├─ GUI/           ← the 3-pane front end (shell, panes, theme, components)
   ├─ PREVIEWPANE/   ← the live interactive preview surface
   ├─ ARTEFACTS/     ← generated outputs (docs, workflows, code the LLM produces for the user)
   └─ LLMBUILD_DATA/ ← prompt history, eval results, token telemetry (the WatcherLLM's memory)
```

## The one rule that matters most

**No workarounds. No hardcoding. Root-cause fixes only, expressed as small, named, composable
functions in clearly identifiable modules.** The precise, buildable version of this rule — and
why the literal version is impossible — is in the [Charter](docs/PROJECT_CHARTER.md#2-the-engineering-laws-non-negotiable).

---

*Status: Phase 4 done (multi-domain packs). Phase 5 — tool/connector registry & real
workflows. Security is explicitly deferred until proof-of-concept is proven (see Charter §6).*
