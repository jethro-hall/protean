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
