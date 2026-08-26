# koma-miko (alpha)

Deterministic skill and action contract verification for AI agent workflows.

Think of each contract as an **Agent Spec**: a developer-owned executable test
for how an agent prepares, acts, and completes work—not an enterprise policy
console.

Miko checks observable evidence at three points:

1. **Prepare** — were the required skills and references loaded?
2. **Pre-action** — is the proposed tool, risk, and path scope allowed?
3. **Complete** — did the required tests, reviews, or artifacts actually happen?

Install the public alpha with:

```sh
npm install koma-miko@alpha
```

Its API may change before the first stable release.

## Why

Agent instructions are useful guidance, but guidance is not enforcement. A skill
may fail to activate, lose influence in a long session, or be followed initially
while its completion checklist is skipped later. **Miko does not inspect hidden
model state, measure whether instructions still influence a near-million-token
context, or prove that an agent chose correctly among 100 skills.** A host
records observable events, and Miko checks those events against explicit
contracts.

## Example

The developer-facing project file is `miko.json`:

```json
{
  "$schema": "./node_modules/koma-miko/schema/miko.schema.json",
  "version": 1,
  "specs": [
    {
      "id": "ui-change-v1",
      "appliesWhen": {
        "action": {
          "tools": ["Edit", "Write"],
          "pathPrefixes": ["src/ui"]
        }
      },
      "requires": {
        "skills": [
          { "name": "product-design", "reloadAfterCompaction": true }
        ]
      },
      "mode": "enforce"
    }
  ]
}
```

The TypeScript API consumes the same spec objects directly:

```ts
import { createMiko } from 'koma-miko';

const miko = createMiko({
  contracts: [{
    id: 'ui-change-v1',
    // The host can activate this contract from the actual action, even when
    // the agent forgot to label the task as UI work.
    appliesWhen: {
      action: {
        tools: ['write_file'],
        pathPrefixes: ['src/ui'],
      },
    },
    requires: {
      skills: [{ name: 'product-design', reloadAfterCompaction: true }],
      references: ['docs/design-system.md'],
    },
    actions: {
      allow: ['read_file', 'write_file', 'run_check'],
      deny: ['delete_file'],
      maxRisk: 'medium',
      scope: {
        tools: ['write_file'],
        allowedPathPrefixes: ['src/ui'],
      },
    },
    completion: {
      evidence: [
        { type: 'check_passed', name: 'rendered-ui-review' },
        { type: 'check_passed', name: 'targeted-tests' },
      ],
    },
    mode: 'review',
  }],
});

miko.startTask({
  sessionId: 'session-7',
  taskId: 'new-settings-page',
  tags: ['ui'],
});

// Missing preparation is REVIEW in review mode (DENY in enforce mode).
miko.verifyPreparation('new-settings-page');

miko.record({
  taskId: 'new-settings-page',
  type: 'skill_loaded',
  name: 'product-design',
  source: 'observed',
});
miko.record({
  taskId: 'new-settings-page',
  type: 'reference_read',
  path: 'docs/design-system.md',
  source: 'observed',
});

miko.verifyAction({
  taskId: 'new-settings-page',
  tool: 'write_file',
  risk: 'medium',
  arguments: { path: 'src/ui/Settings.tsx' },
});

// REVIEW until both completion checks have been recorded.
miko.verifyCompletion('new-settings-page');
```

Every result is machine-readable and explainable:

```ts
{
  decision: 'REVIEW',
  checkpoint: 'COMPLETE',
  reasonCode: 'COMPLETION_EVIDENCE_MISSING',
  reason: 'Required completion evidence is missing.',
  contractIds: ['ui-change-v1'],
  missing: ['ui-change-v1:check_passed:rendered-ui-review']
}
```

The plain-text renderer is intentionally developer-facing and bounded even when
many Agent Specs overlap:

```text
🔴 Miko DENY · PREPARE — PREPARATION_EVIDENCE_MISSING
Missing evidence:
- ui-change-v1:skill_loaded:product-design
Next: load the required skill/reference, then retry the blocked action.
```

## Claude Code hook mapping

`toClaudePreToolUseDecision(result)` maps Miko decisions to Claude Code's
structured `PreToolUse` output:

- `ALLOW` → `allow`
- `DENY` → `deny`
- `REVIEW` → `ask`

Non-ALLOW results also include a concise `systemMessage` for the user and
`additionalContext` for the agent. Miko Verifier has no graphical UI: each host
renders the same structured decision using its native text/approval surface.

The included `koma-miko-claude-hook` executable provides a minimal durable
Claude Code adapter. It observes automatic `Skill` calls, direct `/skill-name`
expansions, `Read`, `Edit`, and `Write` events; persists a privacy-minimized
JSONL ledger including non-ALLOW decisions; and can activate a contract from an
observed tool/path instead of model-supplied tags. See
[`examples/claude-code`](./examples/claude-code).

Skills declared with `reloadAfterCompaction: true` become missing again after a
Claude `PostCompact` event. The adapter keeps JSONL as the append-only audit
record and uses a compact materialized snapshot so each Hook only replays events
written after the latest snapshot. The ledger is auditable, not tamper-proof.

To try the alpha, install the package, copy the example `miko.json` to the
project root, and merge the example hooks into
`.claude/settings.json`. The example is intentionally not enabled automatically:
its enforced `frontend-design` skill must actually exist in the target project.
Miko writes session metadata under `.miko/state/`, which should stay ignored.
Legacy `.miko/contracts.json` arrays remain readable but are no longer the
preferred developer interface.

Run an entirely offline preflight before spending model credits:

```sh
npx koma-miko doctor
npx koma-miko doctor --strict --json
```

Doctor validates Agent Specs and reports project Skill discovery, required
Claude Hook coverage, and whether `.miko/state/` is ignored. It never calls a
model or reads an API key.

Claude Code's local CLI, Desktop Code tab, and VS Code/Cursor extension share
settings, hooks, and skills. Cloud/remote sessions have different configuration
sources, and managed policies can disable project hooks, so adapters must expose
their detected capabilities rather than promise identical behavior everywhere.
See the official [platform overview](https://code.claude.com/docs/en/platforms),
[Desktop shared configuration](https://code.claude.com/docs/en/desktop), and
[VS Code settings](https://code.claude.com/docs/en/ide-integrations).

## Automated replay

`npm run eval:replay -w koma-miko` runs ten simplified skill contracts without
an API key. For every skill it verifies three cases: missing evidence, an agent
claim (`asserted`), and a host-observed load (`observed`). Only observed or
external evidence can satisfy a contract. The first UI case is the narrow
enforcement demo; the other nine remain review-only.
`npm run eval:claude-hook -w koma-miko` additionally spawns three independent
hook processes and verifies an audited `DENY → observed Skill → ALLOW` plus
ledger privacy.
`npm run eval:scale -w koma-miko` uses no API key. It benchmarks 100/1,000 Agent
Specs, 10,000 indexed evidence events, 100 overlapping specs, and snapshot
restore while checking that terminal output remains bounded.
`npm run eval:audit-demo -w koma-miko` regenerates the 13-event fixture behind
the public guided CLI simulation from real Verifier results.
`eval:audit-demo:check` detects a stale fixture without changing it; the replay
contains no prompt, code, or model response and needs no backend. The friendly
terminal story is presentation only; expandable raw events preserve reason
codes, provenance, and contract IDs for inspection.

With `ANTHROPIC_API_KEY` set in the parent process,
`npm run eval:claude-live -w koma-miko` runs one disposable, real Claude Code
fixture. It exposes only `Read`, `Edit`, and `Skill`, defaults to Haiku, enforces
a `$0.10` per-run cap, and checks this sequence:

```text
Read → Miko DENY → Claude loads frontend-design → Miko allows → Edit
```

The fixture is created inside the package workspace so Claude Code treats it as
project content, then deleted. The runner never reads an env file. Override the
defaults with `MIKO_LIVE_MODEL` and `MIKO_LIVE_MAX_BUDGET_USD` (capped by the
runner at `$1`).

For the 100-Skill long-context fixture, start without spending credits:

```sh
npm run eval:claude-scale-dry -w koma-miko
```

Then run one approximately 20k-token Haiku case with a `$0.12` hard cap:

```sh
MIKO_LIVE_CONTEXT_TOKENS=20000 \
MIKO_LIVE_MAX_BUDGET_USD=0.12 \
MIKO_LIVE_CAMPAIGN_BUDGET_USD=0.12 \
npm run eval:claude-scale-live -w koma-miko
```

The runner accepts at most three comma-separated context sizes from 1,000 to
190,000 tokens. It creates exactly 100 project Skills, exposes only
`Read`/`Edit`/`Skill`, runs in a disposable directory, records cache and cost
metrics, and never reads an env file. See the
[alpha evaluation record](../../docs/evals/miko-claude-haiku-alpha.md).

## Alpha boundaries

- **No LLM call or semantic task classifier**
- **No planner, router, or agent runtime**
- **No context-window/token monitoring**
- **One Haiku/100-Skill fixture has passed at approximately 20k tokens; this is not evidence for 100k, 190k, or near-million-token behavior**
- **No hosted telemetry service** (the Claude adapter uses a local JSONL ledger)
- **No automatic rewriting of tool calls**
- **No claim that loading a skill proves the model understood, retained, or followed it**

See the [design and discovery notes](../../docs/design/miko.md), including the
first-hand failure case, public reports used as test discovery data, and the
post-alpha questions. Product positioning and executable follow-up work live in
the [developer roadmap](../../docs/design/miko-roadmap.md).
