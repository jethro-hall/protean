# Protean — Build Log (append-only)

> The shared memory of the project. Every significant design/build change: the user request, what
> changed, and the agent's response. **Append only — never edit or delete past entries.** Newest
> at the bottom. See CONTRIBUTING.md for the required fields.

---

## 2026-07-27 · Claude · Phase 0 · Project founding

**User request (summarised):**
> "Everything we've discussed about protean.rideai.com.au and the Claude SDK — put it into a
> project description for the new build. We're building an enterprise GUI (mobile/iPad/desktop),
> lightweight, fast, cognitive and generative, a full-workflow Claude-Desktop-capability clone
> with a live interactive preview pane. The Claude SDK should enable this. Set up a project, set
> GitHub rules, and ENFORCE: no custom scripts / no workarounds / nothing hardcoded — everything
> composable named functions, clearly identifiable. Must support future SaaS or single-company
> use, and must build workflows for any domain (corporate, doctor's surgery, uni). Break it into
> phases; get to testing the Claude SDK ASAP; latency is critical; lean caching/token use is a
> must; a WatcherLLM optimises every message before any LLM and keeps full I/O history; logging
> to the utmost standard; executive light-blue/orange theme; 3-pane layout (left menu, center
> chat, right functional live preview pane / optional 2nd Claude); settings gear top. Security
> deferred (POC). Name it. Create skills/rules/project description for me, GitHub, and Cursor.
> Every step compiled to GitHub in an APP→CODE→GUI→PREVIEWPANE→ARTEFACTS→LLMBUILD_DATA structure,
> with a CHAT md appended on every significant change. Tell me what I'm missing; make it best
> practice and 100% fit for purpose."

**What changed / decided:**
- Named the project **Protean**.
- Created the repo skeleton under `Ride Electric Finance/protean/`:
  `README.md`, `AGENTS.md`, `.cursorrules`, `CONTRIBUTING.md`, and
  `docs/{PROJECT_CHARTER, ARCHITECTURE, ROADMAP}.md`, `docs/DECISIONS/`, `docs/CHAT/`, plus the
  `APP/{CODE,GUI,PREVIEWPANE,ARTEFACTS,LLMBUILD_DATA}` tree with source subfolders.
- Codified the 8 engineering laws (charter + agent contract + cursorrules), including the precise,
  buildable form of "no workarounds / nothing hardcoded".
- Defined the layered architecture (3-pane GUI, provider-agnostic LLM Gateway, deterministic-first
  WatcherLLM, tiered caching/tokens, first-class structured logging, executive theme).
- Set a 7-phase roadmap; Phase 0 = a measured Claude Agent SDK latency spike (owner's top priority).

**Agent response / notes:**
- Flagged three honest tensions (Charter §4): "full Claude-Desktop clone" vs "lean" pull opposite
  ways; the WatcherLLM risks being an unmeasured extra LLM hop (mitigated: deterministic-by-default,
  measured in Phase 0); "security deferred" is fine for a POC only if we leave cheap seams and never
  commit secrets.
- Added 7 gaps the brief was missing (Charter §5): eval harness, token/cost telemetry, streaming as
  first-class, a history-store contract, designed-vs-silent degradation, an accessibility contract,
  and prompt/version governance.
- **[VERIFY] blockers logged (Law 1, not worked around):** could not reach `docs.anthropic.com`
  (egress-blocked) to confirm current Claude Agent SDK APIs, nor introspect `protean.rideai.com.au`
  (auth redirect). All SDK specifics marked `[VERIFY]` for the implementing agent to confirm against
  live docs before relying on them. Brave search key returned invalid (previously-flagged exposed key).

**Next step:** initialise git, push to GitHub, then Phase 0 — wire `AgentCore` + Claude Agent SDK
adapter behind the Gateway and record real TTFT/latency numbers here.

---

## 2026-07-27 · Claude · Phase 0 · Infrastructure decisions + portable project briefs

**User request (summarised):**
> Architect the whole non-app estate end-to-end now (don't retrofit). Expectations: both LLM adapters
> behind a gateway/proxy because the upstream link is transient; multiple databases (Qdrant, PSQL);
> leverage the NVIDIA GPU for caching LLM / frontend / user-memory (esp. large chats where Claude
> Desktop struggles); a Claude-Desktop-style VM instance, spawnable on the current server (AWS
> g6.2xlarge, DL Base AMI Single CUDA AL2023 20260609); everything non-app in Docker under one common
> compose; set directory/naming/Docker/static-HDD standards now; constantly sanity-check fit-for-
> purpose; test in a browser not just CLI; mandatory (i) info affordance on every required input/
> output (hover/click, what/why/example, no clutter). Standing instruction: "ONLY do what I ask if
> it's the true and correct way, ELSE question me with logic and reasoning — I'm up for challenge."
> Then: bundle the build up, name it, and produce a project for Claude Desktop, a project description,
> settings for Cursor, and a brief for a ChatGPT project.

**What changed / decided:**
- Wrote `docs/INFRASTRUCTURE.md` (gateway/proxy transient-link resilience; DBs; GPU role; caching
  tiers; session sandbox; Docker; static disk; deferred items; open verifications).
- Wrote `docs/NAMING_AND_LAYOUT.md` (repo layout, code naming, `protean-<role>` services,
  `protean_<service>_data` volumes, `protean-net`, `/srv/protean/`, one common compose).
- Wrote `docs/UX_STANDARDS.md` (principles; the MANDATORY (i) info affordance; pascal theme;
  browser-verified sanity discipline; what "no clutter" forbids).
- Updated `.cursorrules` with the infra decisions, GUI rules, and challenge-before-comply.
- Created `project-briefs/` with `CLAUDE_DESKTOP_PROJECT.md`, `CHATGPT_PROJECT.md`,
  `CURSOR_SETUP.md`, and a `README.md` index — one identical brief per surface.

**Agent response / notes (challenged the owner, per standing instruction):**
- **Challenged "GPU to cache LLM/GUI/user-memory":** a GPU is compute, not a cache substrate. The
  real problem ("large chats slow") is context management, fixed by compaction + semantic retrieval;
  the GPU *accelerates* that (embeddings, local fast-model) while caching stays in Redis/RAM. Owner
  agreed — reframed to "GPU = compute, Redis = cache".
- **Challenged "Qdrant now":** recommended PostgreSQL + pgvector for the POC (one fewer service),
  Qdrant deferred behind a `VectorStore` seam. Owner agreed — pgvector now.
- **Challenged build-everything-up-front:** it fights the owner's own top priority (test the SDK
  ASAP). Agreed: architect the full estate in docs now, BUILD Phase 0 lean (gateway + one adapter +
  logger + streaming). Owner reframed Phase 0 acceptance to "answers as accurately and powerfully as
  Claude Desktop", not just a latency number.
- **[VERIFY] still open:** docs.claude.com / docs.anthropic.com remain egress-blocked from this VM;
  attempted an allowlist patch to `coworkEgressAllowedHosts` (saved
  `claude_desktop_config.EGRESS_PATCHED.json`) — running session still enforced the old list, so a
  full app restart + fresh session is required to test, or the allowlist is policy-controlled.
  Consulted the claude-code-guide agent for SDK usage (package `@anthropic-ai/claude-agent-sdk`,
  `query({prompt,options})` streaming, Bedrock via `CLAUDE_CODE_USE_BEDROCK`); it could not reach
  live docs either, so exact option/field names and Bedrock model IDs remain [VERIFY].

**Next step:** create the private personal GitHub repo, push `main`; then Phase 0 code once the SDK
API is confirmed against live docs (pending allowlist/restart).

---
