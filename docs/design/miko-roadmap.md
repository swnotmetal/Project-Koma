# Miko Developer Roadmap

Status: working product memory and TODO for the public alpha.

## Positioning

Miko is a **developer tool**, not an enterprise governance console. A Miko
contract should be presented as an **Agent Spec**: an executable workflow test
that developers keep beside their code, review in Git, and see as a live
traffic-light result while an agent works.

Preferred product sentence:

> Miko is a local contract verifier for Claude Code, Codex, Gemini, VS Code Copilot, and later MCP agent tools.
> It checks observable preparation, action, and completion evidence.

Do not claim "first", "tamper-proof", "100% compliant", or that Miko eliminates
hallucination. `observed` evidence is only as trustworthy as the local host and
append-only JSONL is auditable, not cryptographically immutable.

## Developer experience

**Product principle: minimize tester and user labor.** If Miko can detect,
generate, configure, validate, sanitize, or clean up a test step, Miko should do
it. External testers should not have to download example files, understand Hook
locations, invent a safe fixture, inspect raw transcripts, or manually redact
logs. The target onboarding shape is one command to create an isolated,
reproducible probe and one small result bundle to return.

- [x] Machine-readable `PREPARE`, `PRE_ACTION`, and `COMPLETE` checkpoints.
- [x] Bounded `🔴 DENY` / `🟡 REVIEW` / `🟢 ALLOW` terminal rendering.
- [x] Stable reason codes and actionable recovery text.
- [x] Tool/path activation so the agent does not need to classify its own task.
- [x] Expose the contract file as a root-level `miko.json` Agent Spec while
  retaining `.miko/contracts.json` compatibility.
- [x] Publish a JSON Schema with editor completion and validation.
- [x] Add `miko doctor` to report config errors, host-specific project Skills,
  required Hook coverage, and Git-ignore readiness before a paid run.
- [x] Build a guided CLI simulation from a sanitized deterministic replay; keep
  raw events and the Agent Spec expandable, with no model backend required.
- [x] Publish a developer recovery playbook for common PREPARE, PRE_ACTION, and
  COMPLETE denials.
- [x] Add one privacy-safe, no-model `probe --host` interface for Claude,
  Codex, Gemini, and VS Code adapter conformance; use a separate zero-credit
  `koma-miko-dsh probe` package preflight and reserve `--live` for paid DSH.
- [x] Separate Codex Hook configuration from runtime activation in `doctor`;
  require a real `SessionStart` heartbeat before strict readiness passes.
- [x] Emit Codex `SessionStart` context plus a local activation heartbeat.
- [ ] Make `Miko active` persistently user-visible in Codex Desktop and CLI;
  the current live `codex exec` transcript rendered only `hook: SessionStart
  Completed`, not the adapter's branded `systemMessage`.
- [ ] Replace the current CLI `/hooks` detour with a genuinely clear Codex
  Desktop trust/review path if the host exposes one. Until then, do not market
  Desktop-only onboarding as vibe-coder-ready.
- [ ] Add a one-command VS Code Copilot probe that creates an isolated Skill,
  Agent Spec, Hook configuration, and disposable `src/miko-probe` fixture.
- [ ] Emit a privacy-safe probe report containing only host/version metadata,
  Hook event order, tool names, argument-key names, and Miko decisions; never
  ask testers to send raw Agent Debug Logs by default.
- [ ] Make the probe clean up its fixture automatically or print one explicit,
  recoverable cleanup command.

## Evidence ledger

- [x] Provenance: `asserted` never satisfies a contract; `observed` and
  `external` may satisfy one.
- [x] Privacy-minimized append-only JSONL without prompt, code, Bash command, or
  model-response persistence.
- [x] Materialized snapshot plus ledger-tail replay for long local sessions.
- [x] Context epochs and optional Skill reload after compaction.
- [ ] Ledger rotation and maximum-size policy.
- [x] Checkpoint recovery tests for ledger tails and corrupt snapshots.
- [ ] Optional hash chaining for tamper evidence; do not describe plain JSONL as
  tamper-proof.
- [ ] A signed external-evidence envelope for CI attestations.

## Scale and model evals

- [x] Zero-API verifier benchmark for 100/1,000 Agent Specs, 10,000 evidence events,
  overlap output, and snapshot restore.
- [x] Generate a real 100-Skill Claude fixture with offline dry-run and hard
  per-run/campaign budget caps.
- [x] Run the approximately 20k Haiku smoke case; keep 100k and 190k pending
  until the result and campaign budget are reviewed.
- [ ] Run the budget-capped 100k/190k Haiku smoke cases.
- [x] Record cache usage, model/tool turns, denials, recovery, completion, and
  cost per run.
- [x] Strengthen the one-Skill Claude live runner so it fails unless the denial
  order, visible Skill rule, exact artifact, COMPLETE decision, and ledger
  privacy all pass; rerun successfully with Haiku on 2026-09-01.
- [ ] Hand-test the same flow interactively in Claude CLI using the isolated
  `miko-claude-cli-lab`; Console API credits do not establish Claude Desktop
  subscription availability or UX parity.
- [ ] Run a paired 850k-900k / 100-Skill Sonnet evaluation only after the harness
  is stable and a separate campaign budget is approved.

The paid model eval must distinguish:

1. discovery failure — the right Skill was not selected;
2. recovery failure — the agent did not recover after Miko denied an action;
3. stale evidence — pre-compaction evidence was incorrectly accepted;
4. compliance failure — the Skill was loaded but its rule was not followed;
5. host failure — permissions or missing Hook capability blocked progress.

## Codex and Gemini adapters

The first cross-host slice is intentionally small: keep the verifier protocol
shared, but let each host own its permission and text surface.

- [x] Define a host-neutral before/after tool mapping with privacy-safe path
  metadata and explicit Skill/reference recovery exceptions.
- [x] Add persistent Codex Hook handling for `PreToolUse`, `PostToolUse`,
  `PostCompact`, `SessionStart`, and `Stop`.
- [x] Add persistent Gemini Hook handling for `BeforeTool`, `AfterTool`,
  `PreCompress`, `SessionStart`, and `AfterAgent`.
- [x] Run zero-API independent-process conformance tests for both adapters.
- [x] Verify live Codex Hook activation with the existing ChatGPT login: after
  exact-hash CLI trust, `SessionStart` and `Stop` reached Miko and the local
  heartbeat ledger was written without an API key.
- [x] Hand-test Codex Desktop after CLI trust. The first patch was denied, a
  hallucinated reference path was rejected, the agent recovered without asking
  the user to handle files, and the final snapshot passed COMPLETE.
- [x] Complete a live Codex `DENY → two Skills/reference recovery → two-file
  edit → COMPLETE` fixture after fixing safe grouped reads. The final run used
  10,252 tokens and did not activate the unrelated shell Spec.
- [ ] Find a host-native way to keep the green recovery/completion result visible;
  CLI collapses successful Miko output to generic Hook-completed lines, while
  Desktop exposes Miko mainly through the agent's commentary and collapsed tool
  activity rather than a persistent native verifier surface.
- [ ] Repeat the Gemini live fixture with a short, low-latency model after the
  CLI/service latency issue is understood; the flash-lite attempt authenticated
  successfully but still hit the 180-second runner timeout.

The current Codex and Gemini adapters are alpha-level host bridges, not a
compatibility guarantee for every editor, hosted session, or future CLI version.
Their completion evidence is limited to events the host actually exposes.

## Post-alpha trust and operations

These are deliberately second/third-stage items from the product review, not
alpha prerequisites:

- [ ] Run a one-week pilot with a real developer or 2–3 person team and record
  how they act on each denial before adding automation.
- [ ] Freeze a v1 verifier signature and publish a compatibility policy after
  the pilot, not before host feedback.
- [ ] Add optional OpenTelemetry/Datadog exporters that emit decision metadata
  without prompt, source, or tool-output content.
- [ ] Add hash-chain or signed external-evidence options if teams need tamper
  evidence; do not call the local JSONL ledger tamper-proof.
- [ ] Design organization-owned base Specs with explicit developer overrides
  only after the local developer workflow is stable.
- [ ] Add a second-eyes audit or model-assisted review only as an opt-in layer;
  it must never replace deterministic observed evidence.

## MCP adapter

MCP is the next adapter candidate, not part of the current alpha. The valuable
scope is a business-contract interceptor, not a generic MCP security gateway:

1. inspect a proposed MCP tool call before forwarding it;
2. require observed reference/test/approval evidence;
3. deny locally when preconditions are missing, so no request reaches the MCP
   server;
4. record successful tool results as privacy-minimized evidence;
5. check completion obligations after the call.

- [x] Define a host-neutral `beforeTool` / `afterTool` adapter protocol (used by
  the Codex and Gemini bridges).
- [ ] Build one narrow deploy-tool fixture requiring `deploy-guide.md` and a
  trusted test result.
- [ ] Measure false denials, recovery behavior, and added latency before making
  ecosystem claims.

## DeepSeek Harness adapter

DSH is the first post-Claude host experiment because its native lifecycle maps
directly to Miko without pretending that the approval service can inspect tool
arguments:

1. `tools/pre-execute` verifies preparation and the proposed native action;
2. `tools/result` records only the immutable final successful outcome;
3. `agent/turn-stopping` checks completion and may steer another step.

- [x] Scaffold private `koma-miko-dsh` as a DSH bundle.
- [x] Keep Cordis and DSH core packages as peers so the plugin cannot introduce
  duplicate runtime singletons.
- [x] Map DSH `skill`, filesystem, shell, and Code Mode sub-call events into
  privacy-minimized Miko evidence.
- [x] Bound completion steering so an unsatisfied spec cannot loop forever.
- [x] Compile and run tests against the pinned DSH Developer Preview release.
- [x] Install the local bundle into a disposable DSH profile, verify
  `--dump-config`, and boot the Web host without using a model API.
- [x] Publish `koma-miko@0.1.0-alpha.0` and install the adapter tarball into
  disposable DSH profiles without relying on a monorepo workspace link.
- [x] Run one narrow paid session showing blocked action, observed Skill load,
  successful exact check evidence, and accepted completion.
- [x] Commit a bounded live-eval runner that validates the DSH session artifact
  instead of trusting the model's completion text.
- [x] Run three packed-artifact Haiku evaluations and record 3/3 recovery,
  request/token usage, and model-phase latency without generalizing the sample.
- [x] Publish `koma-miko` and `koma-miko-dsh` public alphas, then verify the
  documented `koma-miko-dsh@alpha` registry install in a fresh DSH profile.
- [x] Make resume/restart begin a fresh evidence epoch in the first alpha and
  explicitly require Skills, references, changes, and checks to be observed
  again. Durable replay remains a later opt-in design problem.

Do not publish or market broad DSH compatibility until these gates pass. DSH is
still a Developer Preview and its plugin contracts may change between RCs.
The measured result is recorded in
[the Miko × DSH alpha evaluation](../evals/miko-dsh-alpha.md).

## Koma composition

Keep every package standalone. Composition should happen through evidence and
events, not package-to-package imports:

- `koma-gate` may emit a trusted classification event;
- `koma-scout` may emit a perimeter decision;
- `koma-core` may provide protected retrieval evidence;
- `koma-miko` remains the verifier for applicable Agent Specs.

Do not rename nonexistent packages to “Koma Input” or “Koma Network”, and do not
market Miko as a universal final judge until these event bridges exist and are
tested.
