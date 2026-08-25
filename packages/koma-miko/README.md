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
while its completion checklist is skipped later. Miko does not inspect hidden
model state or guess from context length. A host records events, and Miko checks
those events against explicit contracts.

## Example

```ts
import { createMiko } from 'koma-miko';

const miko = createMiko({
  contracts: [{
    id: 'ui-change-v1',
    appliesWhen: { taskTags: ['ui'] },
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
});
miko.record({
  taskId: 'new-settings-page',
  type: 'reference_read',
  path: 'docs/design-system.md',
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

The host is still responsible for assigning task tags and persisting the event
ledger across hook processes. Miko does not silently infer either.

## Alpha boundaries

- No LLM call or semantic task classifier
- No planner, router, or agent runtime
- No context-window/token monitoring
- No durable storage or telemetry service
- No automatic rewriting of tool calls
- In-memory task ledger only

See the [design and discovery notes](../../docs/design/miko.md), including the
first-hand failure case, public reports used as test discovery data, and the
post-alpha questions.
