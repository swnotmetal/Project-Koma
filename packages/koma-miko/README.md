# koma-miko (alpha)

Deterministic skill and action contract verification for AI agent workflows.

Miko checks observable evidence at three points:

1. **Prepare** — were the required skills and references loaded?
2. **Pre-action** — is the proposed tool, risk, and path scope allowed?
3. **Complete** — did the required tests, reviews, or artifacts actually happen?

This source alpha is not published to npm yet. Its API may change before the
first public release.

## Why

Agent instructions are useful guidance, but guidance is not enforcement. A skill
may fail to activate, lose influence in a long session, or be followed initially
while its completion checklist is skipped later. **Miko does not inspect hidden
model state, measure whether instructions still influence a near-million-token
context, or prove that an agent chose correctly among 100 skills.** A host
records observable events, and Miko checks those events against explicit
contracts.

## Example

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
      skills: ['product-design'],
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
  reasonCode: 'COMPLETION_EVIDENCE_MISSING',
  reason: 'Required completion evidence is missing.',
  contractIds: ['ui-change-v1'],
  missing: ['ui-change-v1:check_passed:rendered-ui-review']
}
```

## Claude Code hook mapping

`toClaudePreToolUseDecision(result)` maps Miko decisions to Claude Code's
structured `PreToolUse` output:

- `ALLOW` → `allow`
- `DENY` → `deny`
- `REVIEW` → `ask`

Non-ALLOW results also include a concise `systemMessage` for the user and
`additionalContext` for the agent. Miko core has no graphical UI: each host
renders the same structured decision using its native text/approval surface.

The included `koma-miko-claude-hook` executable provides a minimal durable
Claude Code adapter. It observes automatic `Skill` calls, direct `/skill-name`
expansions, `Read`, `Edit`, and `Write` events; persists a privacy-minimized
JSONL ledger including non-ALLOW decisions; and can activate a contract from an
observed tool/path instead of model-supplied tags. See
[`examples/claude-code`](./examples/claude-code).

To try the source alpha, build/install the package, copy the example contract to
`.miko/contracts.json`, and merge the example hooks into
`.claude/settings.json`. The example is intentionally not enabled automatically:
its enforced `frontend-design` skill must actually exist in the target project.
Miko writes session metadata under `.miko/state/`, which should stay ignored.

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

## Alpha boundaries

- **No LLM call or semantic task classifier**
- **No planner, router, or agent runtime**
- **No context-window/token monitoring**
- **No validated model-behavior claim for near-million-token contexts or 100-skill registries**
- **No hosted telemetry service** (the Claude adapter uses a local JSONL ledger)
- **No automatic rewriting of tool calls**
- **No claim that loading a skill proves the model understood, retained, or followed it**

See the [design and discovery notes](../../docs/design/miko.md), including the
first-hand failure case, public reports used as test discovery data, and the
post-alpha questions.
