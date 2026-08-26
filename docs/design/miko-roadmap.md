# Miko Developer Roadmap

Status: working product memory and TODO for the source alpha.

## Positioning

Miko is a **developer tool**, not an enterprise governance console. A Miko
contract should be presented as an **Agent Spec**: an executable workflow test
that developers keep beside their code, review in Git, and see as a live
traffic-light result while an agent works.

Preferred product sentence:

> Miko is a local contract verifier for Claude Code and, later, MCP agent tools.
> It checks observable preparation, action, and completion evidence.

Do not claim "first", "tamper-proof", "100% compliant", or that Miko eliminates
hallucination. `observed` evidence is only as trustworthy as the local host and
append-only JSONL is auditable, not cryptographically immutable.

## Developer experience

- [x] Machine-readable `PREPARE`, `PRE_ACTION`, and `COMPLETE` checkpoints.
- [x] Bounded `🔴 DENY` / `🟡 REVIEW` / `🟢 ALLOW` terminal rendering.
- [x] Stable reason codes and actionable recovery text.
- [x] Tool/path activation so the agent does not need to classify its own task.
- [x] Expose the contract file as a root-level `miko.json` Agent Spec while
  retaining `.miko/contracts.json` compatibility.
- [x] Publish a JSON Schema with editor completion and validation.
- [x] Add `miko doctor` to report config errors, discovered project Skills,
  required Hook coverage, and Git-ignore readiness before a paid run.
- [x] Build a guided CLI simulation from a sanitized deterministic replay; keep
  raw events and the Agent Spec expandable, with no model backend required.

## Evidence ledger

- [x] Provenance: `asserted` never satisfies a contract; `observed` and
  `external` may satisfy one.
- [x] Privacy-minimized append-only JSONL without prompt, code, Bash command, or
  model-response persistence.
- [x] Materialized snapshot plus ledger-tail replay for long local sessions.
- [x] Context epochs and optional Skill reload after compaction.
- [ ] Ledger rotation, maximum size, and checkpoint recovery tests.
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
- [ ] Run a paired 850k-900k / 100-Skill Sonnet evaluation only after the harness
  is stable and a separate campaign budget is approved.

The paid model eval must distinguish:

1. discovery failure — the right Skill was not selected;
2. recovery failure — the agent did not recover after Miko denied an action;
3. stale evidence — pre-compaction evidence was incorrectly accepted;
4. compliance failure — the Skill was loaded but its rule was not followed;
5. host failure — permissions or missing Hook capability blocked progress.

## MCP adapter

MCP is the next adapter candidate, not part of the current alpha. The valuable
scope is a business-contract interceptor, not a generic MCP security gateway:

1. inspect a proposed MCP tool call before forwarding it;
2. require observed reference/test/approval evidence;
3. deny locally when preconditions are missing, so no request reaches the MCP
   server;
4. record successful tool results as privacy-minimized evidence;
5. check completion obligations after the call.

- [ ] Define a host-neutral `beforeTool` / `afterTool` adapter protocol.
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
- [ ] Install a packed artifact after `koma-miko` has a resolvable published
  version; the experiment currently links the unpublished workspace package.
- [x] Run one narrow paid session showing blocked action, observed Skill load,
  successful exact check evidence, and accepted completion.
- [x] Commit a bounded live-eval runner that validates the DSH session artifact
  instead of trusting the model's completion text.
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
