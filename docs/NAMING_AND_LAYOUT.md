# Protean — Naming, Layout & Docker Standard

> Set now so nothing is retrofitted (owner directive, 2026-07-27). Binding on all agents and all
> code. If a new artefact doesn't have an obvious home under these rules, that's a gap — raise it in
> an ADR, don't invent an ad-hoc location.

---

## 1. Repository layout (the monorepo)

```
protean/
  README.md                     # front door
  AGENTS.md  .cursorrules        # agent contracts
  CONTRIBUTING.md  .gitignore  .env.example
  docs/
    PROJECT_CHARTER.md          # the constitution (laws, vision)
    ARCHITECTURE.md             # system design
    INFRASTRUCTURE.md           # non-app estate (gateway, DBs, GPU, Docker, sandbox, disk)
    NAMING_AND_LAYOUT.md        # this file
    UX_STANDARDS.md             # GUI laws ((i) affordance, no clutter, browser-verified)
    ROADMAP.md                  # phases
    DECISIONS/                  # ADR-NNNN-<slug>.md — one per hard call
    CHAT/
      BUILD_LOG.md              # append-only: every significant change
      sessions/                 # per-session detail logs
  project-briefs/               # portable briefs for Claude Desktop / Cursor / ChatGPT
  infra/                        # Docker estate — the common compose lives here (see §4)
  APP/
    CODE/                       # backend engine (provider-agnostic; knows no domain)
      src/{agent,gateway,watcher,logging,contracts,config,domains}/
    GUI/                        # React/Vite frontend (3-pane shell)
      src/{shell,panes,theme,components}/
    PREVIEWPANE/                # live preview pane module
    ARTEFACTS/                  # generated artefacts (committed — owner wants full build data)
    LLMBUILD_DATA/              # prompt-history / eval-results / token-telemetry (committed)
```

Rule: **APP** is the application; **infra** is everything else (Charter Law: app vs estate split).
Domain knowledge lives ONLY in `APP/CODE/src/domains/<domain>/` as data (Law 2).

---

## 2. Code naming conventions

| Thing | Convention | Example |
|---|---|---|
| Directories | kebab-case | `preview-pane/`, `token-telemetry/` |
| TS source files | camelCase (impl) / PascalCase (types/classes) | `assemble.ts`, `LlmGateway.ts` |
| Interfaces | PascalCase, no `I` prefix | `LlmGateway`, `SandboxProvider`, `VectorStore` |
| Adapters | `<provider>.ts` inside `adapters/` | `gateway/adapters/claude.ts` |
| Functions | small, verb-first, one job (Law 3) | `assemblePrompt()`, `recordTurn()` |
| Env vars | `PROTEAN_*` (ours) or vendor-native | `PROTEAN_FAST_MODEL`, `AWS_REGION` |
| Contracts/schemas | in `contracts/`, noun.ts | `turn.ts`, `domainPack.ts` |

No magic numbers or domain literals in code — they resolve from config/packs (Law 2).

---

## 3. Service & container naming

Every runtime service is `protean-<role>`. One word roles, no ambiguity.

| Service | Container name | Role |
|---|---|---|
| App backend | `protean-app` | engine (agent/gateway/watcher/logging) |
| LLM proxy | `protean-gateway` | provider-agnostic, transient-link resilient |
| Relational DB | `protean-pg` | PostgreSQL + pgvector (truth + vectors, POC) |
| Cache | `protean-cache` | Redis (hot/ephemeral) |
| GPU accessor | `protean-gpu` | embeddings + optional local fast-model `[VERIFY toolkit]` |
| Session sandbox | `protean-sandbox-<sessionId>` | one ephemeral instance per working session |
| (deferred) Vector DB | `protean-qdrant` | only when scale triggers the pgvector→Qdrant swap |

Network: one bridge, `protean-net`. Volumes: `protean_<service>_data`
(`protean_pg_data`, `protean_redis_data`, …). Static host root: `/srv/protean/` (INFRASTRUCTURE §8).

---

## 4. Docker standard

- **One common compose:** `infra/docker-compose.yml`. No per-service compose files, no stray
  `docker run`. Everything non-app is declared here.
- **Pinned tags** — never `:latest`. Record the pinned versions in the compose and an ADR.
- **Healthchecks** on every service; `depends_on: { condition: service_healthy }`.
- **Named volumes only** (§3), mapped under `/srv/protein/` per the disk standard.
- **Secrets** from env/secret-store, never baked into an image or committed (the one security rule
  that holds during the POC).
- **Resource limits** declared per service; GPU access only via `protean-gpu`, never raw device
  passthrough to a sandbox.
- App may run **on-host in Phase 0** (fastest SDK iteration) and be containerised from Phase 1 —
  the compose has a `protean-app` service stub from the start so the seam exists.

---

## 5. Git & change naming (mirrors CONTRIBUTING.md)

- Branches: `main`, `phase/<n>-<slug>`, `feat|fix|chore/<slug>`.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Every significant change → a `docs/CHAT/BUILD_LOG.md` entry (append-only) + an ADR if it's a
  hard architectural call.
