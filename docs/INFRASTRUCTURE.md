# Protean — Infrastructure & Deployment Standard

> The **non-app estate**: everything that is not the application code itself. This document is
> binding. It is architected end-to-end *now* so nothing is retrofitted later (owner directive,
> 2026-07-27). Where a live fact could not be verified from this environment it is marked
> `[VERIFY]` — never guessed (Charter Law 1).

---

## 0. BLUF

Protean runs as a small set of **Docker services behind one common `docker-compose`**, plus the
**app** (backend engine + GUI) which may run in-container or on-host. Every LLM call — regardless
of provider — goes through **one gateway/proxy** that is built to survive a *transient upstream
link* (Bedrock token expiry, network blips, provider 5xx). State lives in **PostgreSQL**
(relational/truth) and **Qdrant** (vectors/memory). Hot paths are accelerated by a **tiered cache**
that can be promoted onto the **NVIDIA L4 GPU** for large-chat inference and embedding workloads.
Each user working session gets an isolated **sandbox VM instance**, spawnable on the current server
today and portable to a fleet later.

---

## 1. Target hardware (current server)

| Attribute | Value | Source |
|---|---|---|
| Instance | AWS **g4dn.xlarge** (owner brief said g6.2xlarge — measured otherwise, see note) | IMDS, measured 2026-07-27 |
| vCPU / RAM | 4 vCPU / 16 GiB | `nproc`; `free -g`, measured 2026-07-27 |
| GPU | **1× NVIDIA Tesla T4** (16 GB GDDR6) | `nvidia-smi`, measured 2026-07-27 |
| AMI | Amazon **Deep Learning Base AMI, Single CUDA (Amazon Linux 2023)**, build 20260609 | owner |
| Region | ap-southeast-2 (Sydney) — matches Bedrock egress allowlist | `.env.example` |

> **Discrepancy flagged 2026-07-27:** the owner brief specified g6.2xlarge (8 vCPU / 32 GiB /
> L4 24 GB). The box this repo actually runs on is a **g4dn.xlarge** — half the vCPU/RAM and a
> T4 with 16 GB. All GPU sizing below assumed 24 GB; re-check batch sizes and any local
> fast-model choice against 16 GB before enabling `protean-gpu`. If a g6.2xlarge is still the
> intended target, this VM is not it.

**Design consequence.** One GPU with 16 GB is a *shared, scarce* resource. Protean does **not**
host a large base LLM on it by default — the reasoning models are called via the gateway (Bedrock/
API). The GPU is reserved for: (a) **embeddings** for Qdrant, (b) optional **small local fast-model**
for the WatcherLLM cheap path, and (c) **cache acceleration** (§5). GPU contention is a first-class
scheduling concern, not an afterthought — see §5.4.

---

## 2. Service topology (the estate)

```
                         ┌─────────────────────────────────────────────┐
   browser (mobile/      │                 protean-app                  │
   iPad/desktop) ───────▶│   GUI (React/Vite)  +  backend engine        │
                         │   agent · gateway · watcher · logging        │
                         └───────┬──────────────┬───────────┬───────────┘
                                 │              │           │
                    ┌────────────▼───┐   ┌──────▼─────┐  ┌──▼───────────┐
                    │ protean-gateway│   │ protean-pg │  │protean-qdrant│
                    │  (LLM proxy,   │   │ PostgreSQL │  │  vectors /   │
                    │  transient-    │   │  (truth)   │  │  memory      │
                    │  link resilient)│  └────────────┘  └──────────────┘
                    └───┬────────┬───┘
             ┌──────────▼─┐   ┌──▼───────────┐        ┌────────────────┐
             │ claude/    │   │ openai/gemini│        │ protean-cache  │
             │ bedrock    │   │ adapters     │        │ (Redis + GPU   │
             │ adapter    │   │              │        │  cache tier)   │
             └────────────┘   └──────────────┘        └────────────────┘

   session isolation:  protean-sandbox-<sessionId>  (ephemeral VM/container per working session)
```

Every box except `protean-app` is a Docker service in the common compose (§6). `protean-app`
may run on-host during Phase 0 (fastest SDK iteration) and be containerised from Phase 1.

---

## 3. The Gateway / Proxy — transient-link resilience (the core decision)

**Why it exists.** The owner requires **both** provider paths (Claude via Bedrock, and direct API)
behind one proxy *because the upstream link is transient* — Bedrock bearer tokens expire, SSO
redirects, providers rate-limit and 5xx. The app must never see that turbulence.

**Contract.** The gateway is the *only* component that holds provider credentials or speaks a
vendor wire protocol. The app speaks one internal protocol (`contracts/turn.ts`) to the gateway;
the gateway owns everything below.

**Resilience behaviours (all deterministic, all logged):**

1. **Credential lifecycle** — tokens/keys are resolved from env/secret-store, cached with their
   TTL, and **refreshed before expiry**, not on failure. A 401/expired-token triggers one silent
   refresh-and-retry before any error surfaces.
2. **Retry with backoff + jitter** — idempotent requests retry on 429/500/502/503/504 and
   connection resets; capped attempts; every attempt logged with reason.
3. **Circuit breaker per provider** — repeated failures open the breaker and route to the
   configured fallback adapter (or degrade gracefully, §Architecture) rather than hammering a
   dead upstream.
4. **Streaming continuity** — a dropped stream mid-turn is surfaced as a typed partial, never
   silently truncated (Charter: no faked certainty).
5. **Provider adapters are pluggable** — `adapters/claude.ts` (Bedrock + API), `adapters/openai.ts`,
   `adapters/gemini.ts`. Selecting a provider is config, not code (Law 5). Both the Claude and the
   OpenAI/Gemini paths are wired **from the start**, behind the same interface, so switching is a
   config flip and A/B latency comparison is trivial.
6. **Uniform telemetry** — TTFT, total latency, token counts, cache hit/miss, retries, provider,
   model tier — emitted for *every* call to `LLMBUILD_DATA/token-telemetry/` (§Architecture §6).

`[VERIFY]` The exact Bedrock + Agent SDK auth handshake (bearer vs SigV4, refresh endpoint) against
live docs before Phase 0 code — `docs.anthropic.com` was egress-blocked from this environment.
`bedrock-runtime.ap-southeast-2.amazonaws.com` and `*.rideai.com.au` ARE on the allowlist.

---

## 4. Databases

Two stores, each with one job. No overlap, no ambiguity (Charter: one source of truth).

### 4.1 PostgreSQL — `protean-pg` (relational truth)
Owns everything that must be exact, transactional, and auditable:
conversations, turns, message lineage, tool-call records, domain-pack registry, tenant/user config,
token/cost ledger, BUILD/audit events. Schema is migration-managed (no ad-hoc DDL). This is the
system of record; if Postgres and any cache disagree, **Postgres wins**.

### 4.2 Vector store — `pgvector` now, Qdrant later (vectors / memory)
Owns semantic retrieval: long-chat memory compaction, user/tenant memory, domain knowledge,
prior-artefact recall for the preview pane. Embeddings are generated on the GPU (§5) or via a
gateway embedding adapter — never fabricated, never zero-filled on failure.

**POC decision (2026-07-27, owner-confirmed):** use the **`pgvector`** extension inside
`protean-pg`, not a separate Qdrant service. Rationale — one fewer service to run, operate, and
fail during the POC; the vector volume is small at this stage where pgvector is more than adequate.
Access is via a `VectorStore` interface (Law 7 seam); **Qdrant becomes an adapter swap + ADR** when
measured volume, filtered search, or sharding justify it — not before. Collections/rows are
**namespaced per tenant** from day one even though only one tenant exists (SaaS seam). The
`protean-qdrant` service in the topology diagram is therefore **deferred** — the seam is built now,
the service is not stood up until the trigger fires.

### 4.3 Redis — `protean-cache` (ephemeral, hot)
Deterministic prompt/response cache, session state, rate-limit counters, GPU-cache index. TTL-driven
(`PROTEAN_CACHE_TTL_SECONDS`). Nothing here is a source of truth — it is always reconstructable
from Postgres/Qdrant. Losing Redis costs latency, never correctness.

---

## 5. Caching & the GPU (latency is the product)

Caching is layered; each layer is measured and can be individually disabled without breaking
correctness (fail-open to the layer below, ultimately to a fresh LLM call).

### 5.1 Tiered cache
| Tier | Store | Holds | Keyed on |
|---|---|---|---|
| L0 in-proc | app memory (LRU) | last-N assembled prompts/responses | prompt hash |
| L1 shared | Redis | cross-session deterministic prompt→response, session state | prompt hash + domain + tier |
| L2 provider | provider-native prompt caching | stable system/domain-pack prefixes | prefix (managed by adapter) |
| L3 semantic | Qdrant | "we've answered something like this" recall | embedding similarity |

### 5.2 GPU-backed acceleration (`[VERIFY]` on hardware before committing)
The GPU (T4, 16 GB — see §1) is used to make the cache and large chats fast, in priority order:
1. **Embeddings** for L3 semantic cache + Qdrant — batched on GPU; the single highest-value GPU use.
2. **KV-cache / large-context handling for a local fast model** (WatcherLLM cheap path + summar/
   compaction of long chats). This is the direct answer to "Claude Desktop struggles on large
   chats": compaction and recall run locally on GPU so the reasoning model receives a lean,
   pre-optimised context instead of a bloated one.
3. **Frontend/user-memory cache warming** — precompute embeddings of the active user's memory so
   the preview pane and recall are instant on session resume.

GPU inference is **optional and degradable**: if the GPU is busy or absent, the WatcherLLM cheap
path falls back to the gateway fast-model tier. No feature *requires* the GPU to be correct — it
only makes it faster (Charter: designed degradation, never silent).

### 5.3 What the GPU is NOT for (now)
Hosting the primary reasoning model. 24 GB is insufficient for a frontier model at good latency,
and it contends with embeddings. Reasoning stays on Bedrock/API via the gateway. Revisit only with
an ADR and measured evidence.

### 5.4 GPU as a scheduled resource
One GPU, many session sandboxes. GPU work is queued through a single accessor (a `protean-gpu`
service or in-gateway scheduler) with per-session fairness and a hard concurrency cap. No sandbox
gets raw device access. `[VERIFY]` NVIDIA Container Toolkit present on the DL Base AMI —
`nvidia-smi` in a test container — before compose declares `gpus`.

---

## 6. Docker & the common compose

**Law:** every piece of the architecture that is not the app is a Docker service, and they all live
in **one common compose** at `infra/docker-compose.yml`. No stray `docker run`. No per-service
compose files.

Structure:
```
infra/
  docker-compose.yml          # the one compose — all services
  .env                        # infra env (gitignored; infra/.env.example is committed)
  postgres/  init.sql, conf   # protean-pg
  qdrant/    config           # protean-qdrant
  redis/     redis.conf       # protean-cache
  gateway/   Dockerfile       # protean-gateway (built from APP/CODE, gateway target)
  sandbox/   Dockerfile       # protean-sandbox base image (§7)
  gpu/       Dockerfile       # protean-gpu accessor (embeddings/fast-model) [VERIFY toolkit]
```

Rules: pinned image tags (no `:latest`); named volumes only (§8); healthchecks on every service;
`depends_on` with `condition: service_healthy`; one shared user-defined bridge network
`protean-net`; resource limits declared; secrets via env/secret-store, **never baked into images**.

---

## 7. Session sandbox — the VM/instance model

Claude Desktop gives each working session an isolated VM. Protean matches this: **one ephemeral
sandbox per working session**, spawnable on the g6.2xlarge today, portable to a fleet/orchestrator
(k8s/Nomad/Firecracker) later without app changes (Law 7 seam).

- **Unit today:** a container (`protean-sandbox-<sessionId>`) from a common base image — cheap,
  fast to spawn, resource-capped (CPU/RAM/GPU-quota/disk), network-restricted, non-root.
- **Lifecycle:** spawn on session open → mount only that session's scratch volume → reclaim on
  close/idle-timeout. Deterministic, logged, no orphan leakage.
- **Isolation:** no sandbox sees another session's data, the host secret store, or raw GPU. GPU is
  brokered through `protean-gpu` (§5.4).
- **Portability seam:** a `SandboxProvider` interface with a `LocalDockerProvider` implementation
  now; a fleet provider later is a new adapter, not a rewrite.

`[VERIFY]` whether true micro-VM isolation (Firecracker) is warranted vs containers — decide with an
ADR once the POC proves the model. POC uses containers (security deferred, owner directive).

---

## 8. Static disk / HDD standard

The g6.2xlarge has a root EBS volume; large/persistent data must live on a **declared static path**,
not scattered. Standard host layout (`[VERIFY]` actual mount points on box — `df -h`, `lsblk`):

```
/srv/protean/                     # single root for all Protean persistent data
  postgres/                       # protean-pg volume  → docker volume protean_pg_data
  qdrant/                         # protean-qdrant     → protean_qdrant_data
  redis/                          # protean-cache      → protean_redis_data
  models/                         # local GPU model weights (fast-model, embedder)
  sandbox/<sessionId>/            # per-session scratch, reclaimed on close
  artefacts/                      # generated artefacts mirrored from APP/ARTEFACTS
  logs/                           # structured JSON logs (rotated)
  backups/                        # pg_dump + qdrant snapshots
```

Volume-naming law: `protean_<service>_data`. Backups are scheduled (pg_dump + Qdrant snapshot) to
`/srv/protean/backups` — a POC still must not lose the user's memory. `[VERIFY]` whether a separate
data EBS volume should be attached and mounted at `/srv/protean` before production; POC may use root.

---

## 9. What is deferred (and safe to defer)

Per owner directive, **security hardening is deferred** until the POC is proven — with three
non-negotiable exceptions that hold *now*: (1) never commit secrets, (2) secrets only from
env/secret-store, (3) redact secrets in logs. Also deferred: TLS/ingress hardening, authn/authz,
multi-tenant enforcement (seams only), fleet orchestration, HA/replication. Each is a backlog item
with a seam already in place so it is *additive*, never a rewrite (Charter §6, Law 7).

---

## 10. Open verifications before Phase 0 code (do not guess)

1. `nvidia-smi` + NVIDIA Container Toolkit in a test container (GPU truly usable from Docker).
2. Bedrock + Claude Agent SDK auth handshake vs live docs (`[VERIFY]` — was egress-blocked).
3. Actual vCPU/RAM/disk/mounts on the box (`nproc`, `free -g`, `df -h`, `lsblk`).
4. Qdrant + Postgres + Redis image tags to pin (latest stable at build time).

Each is logged as a blocker in `docs/CHAT/BUILD_LOG.md` until closed with evidence.
