---
name: protean-project-builder
description: Guides whole-system Protean development with inspection, correct module boundaries, lean changes, and proof. Use when working on Protean agent-core, LLM gateway, WatcherLLM, logging, domain packs, GUI, preview pane, infra/Docker, Cursor rules, or phase work. Enforces the 8 laws, phase discipline, token efficiency, cleanup, and evidence.
---

# Protean Project Builder

Use for Protean work in this repo.

## Core mandate

Do not patch symptoms. Understand Protean as a system, then make the smallest correct change at
the right layer. Result must be: fit for the human task, architecturally aligned, lean, testable,
token-efficient, logged, cleaned up, proven.

## Required workflow

### 1. Orient
- Read tail of `docs/CHAT/BUILD_LOG.md`.
- Confirm current phase in `docs/ROADMAP.md`. Stop if the task belongs later.
- Restate: operator, task, module boundary, existing code to inspect.

### 2. Inspect before changing
Search for existing routes, interfaces, adapters, contracts, config keys, domain packs, tests,
ADRs. Extend unless replacement is clearly better — no parallel implementations.

### 3. Choose the correct layer
| Concern | Layer |
|---------|--------|
| Agent loop / tools / subagents | `APP/CODE/.../agent/` |
| Provider I/O | `gateway/` + adapters only |
| Deterministic prompt assemble / rewrite gate | `watcher/` |
| Types crossing boundaries | `contracts/` |
| Values, prompts, thresholds | `config/` or `domains/<pack>/` |
| Turn lineage | `logging/` |
| UI | `APP/GUI/` |
| Live artefacts | `APP/PREVIEWPANE/` / `APP/ARTEFACTS/` |
| Non-app services | `infra/` Docker compose |

### 4. Prefer deterministic code over LLM
Validation, formatting, routing, schema, known state machines, token trimming → code.
LLM only for NLU, generation, summarisation where rules cannot.

### 5. Clean up + prove
Remove dead paths. Return: summary, files changed, tests run, proof output, risks, next step.
Never claim done without evidence. Append BUILD_LOG.
