# Protean — Project Charter

**Status:** Phase 0 (foundation & latency spike)
**Owner:** Jeff (RideAI / GhostStack)
**Primary builders:** Claude (via Claude Agent SDK) + Cursor
**Last updated:** 2026-07-27

This charter is the constitution of the project. Every other document, every commit, and every
AI agent working on this repository defers to it. If a decision conflicts with the charter, the
charter wins — or the charter is amended first (via an ADR in `docs/DECISIONS/`), never silently
overridden.

---

## 1. What we are building (the vision, stated plainly)

Protean is an **enterprise conversational operating surface**: a lightweight, fast web
application that runs equally well on mobile, iPad, and desktop, and reproduces the *capability*
of Claude Desktop — dynamic, multi-step, tool-using workflows that produce genuinely useful
real-world output — while being **model-agnostic** underneath and **engineered for latency and
cost** from the first line.

It is a **shape-shifter by design**. The same product must, without code changes:

- act as a CFO's forensic analyst (its first proving ground — Ride Electric),
- build and run an operational workflow for a doctor's surgery,
- tutor and generate exercises for university students,
- or assemble a generic corporate workflow for any manager or employee.

The differentiator is not "a chat box on an API". It is the combination of: **(a)** a live,
interactive **preview pane** where the user watches the model build an artefact and can steer it
in real time — user and LLM as a two-person team; **(b)** a **WatcherLLM** layer that optimises
every prompt before it reaches the answering model and keeps a complete input/output history;
and **(c)** ruthless **leanness** — caching, token discipline, and low latency treated as
first-class features, not afterthoughts.

**North star:** the new business associate. A CEO, manager, or employee turns to Protean to get
real, useful, traceable data, analysis, output, and architecture for their day-to-day work — and
trusts it because it shows its working and never fakes certainty.

### What "done" means for the product (not just a feature)
The product is proven when a non-technical user, on any device, can pose a real business problem,
watch Protean build the solution live in the preview pane, steer it conversationally, receive a
correct and traceable artefact, and do all of this against **any configured LLM** with latency
and cost that feel effortless — with a complete, human-readable log of everything that happened.

---

## 2. The engineering laws (non-negotiable)

These are the rules Jeff set, sharpened into a form that is actually buildable and enforceable.
They apply to human and AI contributors identically.

### Law 1 — No workarounds. Root-cause only.
When something breaks, you fix the cause, not the symptom. No `try/except: pass`, no silent
fallback that hides a failure, no "just get it working for now" patch that leaves the real defect
in place. If a proper fix is genuinely out of scope right now, you **stop and log it** as a
blocking issue with a title and owner — you do not paper over it.

### Law 2 — Nothing hardcoded that represents a decision, a value, or a domain fact.
Every magic number, string, rate, threshold, prompt, model name, endpoint, colour, and
domain-specific rule lives in **named configuration or a typed contract**, never inline in logic.
Business/domain knowledge is *data and configuration*, code is the *generic engine that consumes
it*. This is precisely what makes Protean shape-shift across a doctor's surgery, a uni, and a CFO
without a rewrite: the engine never knows the domain, the config does.

> **Honest boundary (this is important).** "Literally nothing is hardcoded" is impossible and no
> serious system claims it — the engine's own structure is, by definition, written in code. The
> enforceable and correct version of the rule is: **no domain facts, no tunable values, and no
> decisions are embedded in logic.** The code is a small, generic, composable engine; everything
> that varies by customer, domain, model, or tuning is externalised into config, contracts, and
> registries. Where a value must live near code (e.g. a protocol constant), it is a **named,
> documented constant in a config module**, never a literal buried in a function. I am flagging
> this rather than pretending to meet an impossible bar — that is the charter's own §7 discipline.

### Law 3 — Everything is small, named functions in clearly identifiable sections.
No god-files, no 500-line functions. Each function does one nameable thing. Modules map to the
directory structure (`agent/`, `gateway/`, `watcher/`, `logging/`, `contracts/`, `domains/`).
A newcomer — human or agent — can find any behaviour by its name in seconds. Pure functions
wherever possible; side effects isolated at the edges.

### Law 4 — Deterministic before generative.
Anything that can be computed deterministically (counts, formatting, routing, validation, cache
keys, token budgets) is computed in code, **not** delegated to an LLM. LLMs compose and reason;
they are never the source of a fact that code could have produced. (Carried directly from the
RideAI/GhostStack charter.)

### Law 5 — Provider-agnostic. No lock-in in the core.
The core never imports a vendor SDK directly. It talks to an internal **LLM Gateway** interface.
Claude, OpenAI, Gemini, a local model — each is a swappable adapter behind that interface. The
Claude Agent SDK is our *first and reference* adapter, not a dependency baked into business logic.

### Law 6 — Evidence & traceability.
Every significant output can be traced to its inputs: the prompt sent, the model used, the tokens
spent, the cache state, the tools called, and the raw response. This is the logging mandate
(see ARCHITECTURE §6) and it is not optional.

### Law 7 — SaaS-ready, single-tenant-happy.
Design every boundary so the system *could* become multi-tenant (tenant-scoped config, no global
mutable state, no assumption of a single user) — but do **not** build multi-tenancy now. It must
be equally correct as a one-company tool. Leave the seams; don't fill them yet.

### Law 8 — Best practice or an ADR explaining why not.
Where an industry best practice exists (typed contracts, dependency injection, structured logging,
CI gates), we use it. Any deliberate deviation gets a one-page Architecture Decision Record in
`docs/DECISIONS/` so the reasoning survives.

---

## 3. The multi-domain / SaaS mandate (how the shape-shifting actually works)

Protean stays generic by pushing all variability into three externalised layers:

1. **Domain Packs** (`APP/CODE/src/domains/<domain>/`): a folder of *data and config* — system
   prompts, tool allowlists, vocabulary, output templates, validation contracts, and example
   workflows — that teaches the generic engine how to behave for finance / medical-practice /
   education / generic-corporate. Adding a vertical = adding a Domain Pack, **not** editing the
   engine. This is Law 2 made concrete.
2. **Tool/Connector Registry**: capabilities (search, file I/O, a data-lake query, an email send)
   registered as typed tools the agent can be granted per domain/tenant.
3. **Tenant Config**: which Domain Packs, which LLM provider(s), which tools, which limits — all
   resolved at runtime from config, never compiled in.

If Protean ever goes SaaS, that is (largely) new *configuration and an auth/tenancy layer* on top
of the same engine — exactly what Law 7 preserves.

---

## 4. Red-team: the tensions in this vision, stated honestly

My job is to surface the risks you didn't ask about. Three real tensions:

- **"Full Claude-Desktop clone" vs "lean & low-latency".** Claude Desktop's richness (deep
  agentic loops, many tool round-trips, a live preview) is inherently *more* latency and *more*
  tokens, which fights the leanness goal. These pull in opposite directions. The resolution is
  explicit budgets and tiering (ARCHITECTURE §4–5): cheap/fast models and cache for the common
  path, premium deep loops only when the task's value justifies it. We measure this in Phase 0 —
  we do not assume it.
- **WatcherLLM adds a hop.** Optimising every message *through another LLM* before the answering
  model adds latency and cost to the very thing we're trying to keep lean. This is the single
  biggest architectural risk to the latency goal. Mitigation: the Watcher's default path is
  **deterministic** (templating, history assembly, cache lookup, token budgeting — all code);
  it only invokes a *small, fast* model when genuine rewriting is needed, and that decision is
  itself measured. See ARCHITECTURE §3. Phase 0 must quantify the Watcher's added latency or the
  design changes.
- **"Security deferred" is fine for a POC — but write the seams now.** Deferring security
  (your call, and reasonable for a proof-of-concept) is only safe if we don't build things that
  are painful to secure later. Law 7's boundaries + never logging secrets (ARCHITECTURE §6) keep
  the retrofit cheap. We will not put credentials in code even during the POC — that costs nothing
  now and saves a rewrite later.

---

## 5. What I think you're missing (gaps I'm adding on my own initiative)

You asked me to flag anything absent. Seven things a system of this ambition needs that weren't in
the brief, now folded into the architecture and roadmap:

1. **An evaluation harness.** "Optimise messages for result" is unmeasurable without a way to
   score results. We need a small eval set + a scorer from Phase 1, or "optimised" is just a
   feeling. (LLMBUILD_DATA/eval-results.)
2. **A cost & token telemetry dashboard.** Leanness you can't see, you can't defend. Every call's
   tokens and $ logged and surfaced. (LLMBUILD_DATA/token-telemetry.)
3. **Streaming as a first-class requirement.** Perceived latency is dominated by time-to-first-
   token. Stream everything to the UI; it is the cheapest latency win available.
4. **A conversation/state store contract.** History "at the Watcher layer" needs a defined store
   (schema, retention, retrieval) or it won't survive restarts or scale.
5. **Graceful degradation, not workarounds.** Law 1 forbids hiding failures — but a *designed*
   fallback (provider B when provider A is down, surfaced and logged) is different from a silent
   workaround. We define this explicitly so the two aren't confused.
6. **Accessibility & responsive contract.** "Works on mobile/iPad/desktop" is a testable
   contract (breakpoints, touch targets, keyboard nav), not a hope.
7. **Prompt/version governance.** Prompts are code. They are versioned, diffed, and logged like
   code — otherwise "the Watcher optimises prompts" becomes an untraceable black box.

---

## 6. Scope discipline & security posture

- **One phase at a time** (see ROADMAP). New ideas are classified `current phase / next phase /
  backlog`. Scope creep is challenged, not absorbed.
- **Security is deferred by owner's decision** until the POC proves the vision. This is recorded
  as a conscious trade-off, not an oversight. The *only* security rules that hold even now
  (because they're free and save a rewrite): no secrets in source; secrets from env/secret-store;
  never log a credential; keep tenant/user boundaries clean per Law 7.

---

## 7. How this charter is used by agents

Claude and Cursor both load `AGENTS.md` (which points here). Before writing code, an agent
confirms: does this obey Laws 1–8? Is the value externalised (Law 2)? Is it a named small function
(Law 3)? If a proper fix isn't possible now, the agent logs a blocking issue rather than working
around it (Law 1). Every significant change is appended to `docs/CHAT/BUILD_LOG.md` with the user
request and the agent's response (§ CONTRIBUTING).
