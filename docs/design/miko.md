# Koma Miko — Alpha Design

Status: **source alpha implemented; npm publication pending**.

Miko addresses a narrower, observable problem than general "agent reliability":
an agent starts work without loading a required skill, forgets a loaded contract as
the session grows, skips a required step, or finishes without evidence that the
result obeys the contract.

The alpha should prove that contract before it grows into another agent framework.

---

## 1. Evidence and Problem Statement

### First-hand case

In a real product workflow with Claude Pro and only five or six agent skills,
longer sessions eventually stopped reflecting the relevant skill. This was most
visible in new UI work: the skill's README had to be pasted into the conversation,
or the agent had to be repeatedly asked whether it had invoked the skill and
followed its non-negotiable rules.

This reveals two different failures:

1. **Activation failure** — the required skill is available but is never loaded.
2. **Compliance drift** — the skill was loaded, but later actions or the final
   artifact no longer satisfy it.

### Public reports used as alpha discovery data

These reports are anecdotes, not a prevalence study. They are useful for forming
failure cases and tests, not for claiming a measured failure rate.

| Observed pattern | Representative report |
|---|---|
| A Playwright/testing skill is ignored until the user reminds the agent | [Claude will not follow instructions in skills](https://www.reddit.com/r/ClaudeAI/comments/1oetd0h/claude_will_not_follow_instructions_in_skills/) |
| Project instructions lose influence late in a session; users add repeated checklists or reviewers | [Claude admits it ignores CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1lvgczi/) |
| Several custom skills and project rules are present, but a document migration produces contradictory results | [Claude ignores everything](https://www.reddit.com/r/ClaudeAI/comments/1sr0jzi/claude_ignores_everything/) |
| A session follows rules initially, then stops after many turns; a pre-tool hook is proposed as enforcement | [Claude Code did not respect CLAUDE.md again](https://www.reddit.com/r/ClaudeAI/comments/1rlv0mp/claude_code_did_not_respect_claudemd_again/) |
| Required tests are skipped more often as a project grows | [Keeping Claude from skipping critical tests](https://www.reddit.com/r/ClaudeAI/comments/1m26mur/i_no_longer_know_what_else_to_do_to_keep_claude/) |
| Skills fail to auto-trigger even when their descriptions appear relevant | [Can't get skills to be used](https://www.reddit.com/r/ClaudeCode/comments/1p7khea/cant_get_skills_to_be_used_in_anyway/) |
| A design system is available through Figma/skills, but generated UI still violates it | [Claude Code has access to my design system, yet...](https://www.reddit.com/r/UXDesign/comments/1uct2dx/claude_code_has_access_to_my_design_system_yet/) |

Anthropic's current documentation confirms the important mechanics without
confirming the anecdotes themselves:

- Skill descriptions guide automatic activation, and the troubleshooting advice
  includes invoking a skill directly when it does not trigger.
- After compaction, skills share a re-attachment token budget; older skills can be
  dropped, and the docs recommend hooks when behavior must be enforced
  deterministically.
- Pre-tool hooks can block an action independently of the model's choice.

Sources: [Claude Code skills](https://code.claude.com/docs/en/skills),
[Claude Code hooks](https://code.claude.com/docs/en/hooks-guide).

### Alpha hypothesis

> An explicit task-to-contract declaration plus event evidence can detect a
> missing skill, a forbidden action, and a missing completion obligation without
> inspecting or estimating the model's context window.

Miko should be **event-driven**, not token-threshold-driven. Context length is not
portable across hosts, and "the instruction is still in context" does not prove
that the output obeys it.

---

## 2. What Miko Is

> A small contract verifier for agent workflows. It checks what must be loaded
> before work, what may happen during work, and what evidence must exist before
> completion.

Miko does not take over planning. The host supplies the current task, applicable
contracts, and observable events. Miko returns one of three decisions:

| Decision | Meaning |
|---|---|
| `ALLOW` | The applicable contract is satisfied |
| `DENY` | An objective contract violation exists |
| `REVIEW` | Evidence is missing or the rule requires judgment |

`REVIEW` deliberately leaves the response to the host: ask the agent to load a
skill, request human approval, run a reviewer, or stop.

---

## 3. Three Checkpoints

```text
task submitted
      │
      ▼
┌──────────────────┐   missing required skill   ┌──────────┐
│ 1. PREPARE       ├───────────────────────────►│ REVIEW   │
│ required skills  │                            └──────────┘
└────────┬─────────┘
         │ evidence: skill_loaded / reference_read
         ▼
┌──────────────────┐   forbidden or risky call  ┌──────────┐
│ 2. PRE-ACTION    ├───────────────────────────►│ DENY     │
│ tool + arguments │                            └──────────┘
└────────┬─────────┘
         │ evidence: tool_succeeded / artifact_changed
         ▼
┌──────────────────┐   missing test/render/etc. ┌──────────┐
│ 3. COMPLETE      ├───────────────────────────►│ REVIEW   │
│ obligations      │                            └──────────┘
└────────┬─────────┘
         ▼
       ALLOW
```

### 3.1 Prepare

Before implementation begins, match the host-declared task tags to contracts.
If `ui` work requires `product-design`, Miko asks for evidence that the skill was
loaded. It does not infer hidden model state.

### 3.2 Pre-action

Before a tool call, validate the tool, argument schema, capability, risk, and
scope. This is the original Miko idea and maps naturally to hook systems such as
Claude Code `PreToolUse`.

### 3.3 Complete

Before the agent claims completion, check contract obligations. A UI contract
might require a design-system reference, a rendered screenshot, an accessibility
check, and a passing targeted test. "I followed the skill" is not evidence.

---

## 4. Contract and Evidence Model

```ts
type MikoContract = {
  id: string;
  appliesWhen: { taskTags: string[] };
  requires?: {
    skills?: string[];
    references?: string[];
  };
  actions?: {
    allow?: string[];
    deny?: string[];
    maxRisk?: 'low' | 'medium' | 'high';
    scope?: {
      tools: string[];
      allowedPathPrefixes: string[];
      argumentNames?: string[];
    };
  };
  completion?: {
    evidence: Array<
      | { type: 'skill_loaded'; name: string }
      | { type: 'reference_read'; path: string }
      | { type: 'tool_succeeded'; tool: string; matches?: object }
      | { type: 'artifact_changed'; path: string }
      | { type: 'check_passed'; name: string }
    >;
  };
  mode?: 'review' | 'enforce';
};
```

Example for the motivating UI case:

```json
{
  "id": "ui-change-v1",
  "appliesWhen": { "taskTags": ["ui"] },
  "requires": {
    "skills": ["product-design"],
    "references": ["docs/design-system.md"]
  },
  "actions": {
    "allow": ["read_file", "write_file", "run_check"],
    "deny": ["delete_file"],
    "maxRisk": "medium",
    "scope": {
      "tools": ["write_file"],
      "allowedPathPrefixes": ["src/ui"]
    }
  },
  "completion": {
    "evidence": [
      { "type": "skill_loaded", "name": "product-design" },
      { "type": "reference_read", "path": "docs/design-system.md" },
      { "type": "check_passed", "name": "rendered-ui-review" },
      { "type": "check_passed", "name": "targeted-tests" }
    ]
  },
  "mode": "review"
}
```

Events belong to a host-provided `sessionId` and `taskId`. The alpha keeps an
append-only in-memory event ledger; durable storage and cross-session identity
are later concerns.

---

## 5. Alpha API Sketch

```ts
const miko = createMiko({ contracts: [uiContract] });

miko.startTask({
  sessionId: 'session-7',
  taskId: 'new-settings-page',
  tags: ['ui'],
});

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

const beforeEdit = miko.verifyAction({
  taskId: 'new-settings-page',
  tool: 'write_file',
  arguments: { path: 'src/Settings.tsx' },
  risk: 'medium',
});

const completion = miko.verifyCompletion({
  taskId: 'new-settings-page',
});

// { decision: 'REVIEW', missing: ['check_passed:rendered-ui-review'] }
```

The result must be explainable and machine-readable. The alpha does not need an
LLM call: ambiguous semantic matching returns `REVIEW`.

Implementation: [`packages/koma-miko`](../../packages/koma-miko/README.md).

---

## 6. Alpha Scope and Acceptance Tests

The source alpha implements only the deterministic library and one adapter mapping.

### Included

- Contract schema validation
- Required-skill/reference checks
- Pre-action allow/deny/risk/scope checks
- Completion evidence checks
- In-memory task ledger
- `ALLOW`, `DENY`, and `REVIEW` with stable reason codes
- A Claude Code `PreToolUse` decision mapping (`ALLOW / DENY / REVIEW` to
  `allow / deny / ask`); the host owns cross-process task/evidence persistence

### Not included

- A planner or task decomposition engine
- Automatic skill selection from raw conversation history
- Context-window/token monitoring
- A generic agent runtime
- Durable telemetry, dashboards, or hosted policy service
- An LLM classifier
- Automatic rewriting of tool calls

### Must-pass cases

1. UI task starts without `product-design` evidence → `REVIEW`.
2. Skill is loaded, but a forbidden tool is proposed → `DENY`.
3. All actions pass, but required UI review/test evidence is absent → `REVIEW`.
4. All declared evidence is present → `ALLOW`.
5. A non-applicable contract does not affect an unrelated task.
6. Invalid/unknown evidence never silently satisfies an obligation.

---

## 7. Relationship to Other Koma Packages

```text
                 KOMA
                  │
      ┌───────────┼───────────┬───────────┐
      │           │           │           │
      ▼           ▼           ▼           ▼
    INPUT       NETWORK      DATA        ACTION
    GATE        SCOUT        CORE         MIKO
 prompt/scope  request      split index  skill/action/
 classifier    perimeter    and content  completion contract
```

Each package guards a different boundary and can be used independently. Miko's
distinct story is not "more skills"; it is **observable proof that an applicable
skill contract was honored**.

---

## 8. Decisions Still Needed After Alpha

- Whether task tags must always be supplied by the host or may be suggested by a
  semantic matcher.
- Which adapter comes after Claude Code: MCP, an Agent SDK, or a framework-neutral
  event stream.
- Whether the current `review` → `REVIEW` and `enforce` → `DENY` mapping needs
  per-checkpoint overrides.
- How to cryptographically or operationally trust evidence supplied by a host.
- Whether post-compaction events should require re-loading high-priority skills.
