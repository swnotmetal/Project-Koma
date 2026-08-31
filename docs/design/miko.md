# Koma Miko — Alpha Design

Status: **Public alpha implemented with narrow Claude Code, Codex, Gemini, and
DeepSeek Harness enforcement paths; stable API and broad host claims remain
pending**.

Miko addresses a narrower, observable problem than general "agent reliability":
an agent starts work without loading a required skill, forgets a loaded contract as
the session grows, skips a required step, or finishes without evidence that the
result obeys the contract.

The alpha should prove that contract before it grows into another agent framework.

Developer-facing product language calls this contract an **Agent Spec**: a small,
versioned workflow test rather than an enterprise governance policy.

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

> An explicit or observed action-to-contract activation plus trusted event evidence can detect a
> missing skill, a forbidden action, and a missing completion obligation without
> inspecting or estimating the model's context window.

Miko should be **event-driven**, not token-threshold-driven. Context length is not
portable across hosts, and "the instruction is still in context" does not prove
that the output obeys it.

**This alpha does not observe or control hidden model attention. It has not
validated model behavior with a near-million-token context and 100 available
skills.** The deterministic verifier can be load-tested without an LLM, but whether
an agent selects, retains, and follows the right skill at that scale requires a
separate model eval.

---

## 2. What Miko Is

> A small contract verifier for agent workflows. It checks what must be loaded
> before work, what may happen during work, and what evidence must exist before
> completion.

**Miko does not take over planning.** The host supplies the current task,
applicable contracts, and observable events. Miko returns one of three decisions:

| Decision | Meaning |
|---|---|
| `ALLOW` | The applicable contract is satisfied |
| `DENY` | An objective contract violation exists |
| `REVIEW` | Evidence is missing or the rule requires judgment |

`REVIEW` deliberately leaves the response to the host: ask the agent to load a
skill, request human approval, run a reviewer, or stop.

### UI ownership

**Miko Verifier does not own a graphical interface.** It returns a stable structured
result plus a plain-text rendering. A host adapter owns the final interaction:

- CLI: print the result and use the host's approval prompt;
- Desktop/IDE: show the same text in the native transcript/permission dialog;
- non-interactive runner: emit JSON and an exit status for automation.

For Claude Code, `REVIEW` maps to native `ask`, `DENY` maps to `deny`, and the
adapter returns both a user-visible `systemMessage` and agent-visible recovery
context. This keeps Miko useful on text-only surfaces without coupling the verifier
package to one UI toolkit.

All packaged host adapters use the same interaction policy: `ALLOW` defers to
the host's existing permission engine, `REVIEW` requests native human approval,
and `DENY` blocks the proposed action while preserving an explicit recovery
path for the agent. Miko does not auto-approve a tool call merely because its
own contract is satisfied.

### Claude surface matrix

| Surface | Alpha expectation | Important limit |
|---|---|---|
| Local CLI | Full local Hook path; best automation target | Needs a supported Claude Code credential/provider |
| Desktop Code tab, local session | Same settings, Hooks, Skills, and native approval UI | Interactive only; no `--print` or Agent SDK scripting |
| VS Code / Cursor Claude Code extension | Shared Claude settings and Hooks | Must be the Claude Code extension, not an unrelated editor agent |
| Claude Code cloud/web | Not an alpha target yet | Does not read local user settings; package/install availability differs |
| Other agents/editors | Verifier protocol only | Requires a dedicated adapter; Claude compatibility does not imply support |

Official references: [platform comparison](https://code.claude.com/docs/en/platforms),
[Desktop shared configuration](https://code.claude.com/docs/en/desktop),
[VS Code/Cursor integration](https://code.claude.com/docs/en/ide-integrations), and
[Hook configuration scopes](https://code.claude.com/docs/en/hooks).

### Other alpha host surfaces

| Host | Hook path implemented | Alpha caveat |
|---|---|---|
| Codex CLI/Desktop local project | `SessionStart`, `PreToolUse`, `PostToolUse`, `PostCompact`, `Stop` | Project Hook requires one-time trust; `PreToolUse` cannot surface `ask`, so Miko pauses `REVIEW`; hosted/specialized tools may not emit local events |
| Gemini CLI | `SessionStart`, `BeforeTool`, `AfterTool`, `PreCompress`, `AfterAgent` | Project Hook fingerprint needs trust; full headless live fixture timed out and needs a shorter-model rerun |
| DeepSeek Harness | Native DSH tool/turn lifecycle | Pinned Developer Preview and peer-install workaround; not a broad future-version guarantee |

The adapters share the Miko verifier and privacy rules, but their host-native
outputs are intentionally different. A successful offline conformance test
means the mapping is deterministic; it does not mean every surface has equal
Hook coverage.

### Evidence trust

Every evidence event has a source:

| Source | Meaning | May satisfy a contract? |
|---|---|---|
| `observed` | A host hook observed the lifecycle/tool event | Yes |
| `external` | An independent check produced the result | Yes |
| `asserted` | The agent claimed it happened | No; audit only |

Miko can prove that a skill load event occurred. **It cannot prove that the model
understood, retained, or correctly applied the skill's guidance.**

**Miko cannot force a model to call a Skill from below the model layer.** When a
model skips or falsely claims a Skill, a host adapter can deny the observable
action, show a recovery instruction, and record the violation; it cannot
silently select the correct Skill on the model's behalf.

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

Before implementation begins, a host may explicitly activate a contract. At the
first action, Miko can also match the actual tool and path against a deterministic
selector. If an `Edit` under `src/components` requires `product-design`, the
contract activates even when the agent supplied no `ui` task tag. Miko asks for
host-observed evidence that the skill was loaded; it does not infer hidden model
state.

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
  appliesWhen: {
    taskTags?: string[];
    action?: {
      tools?: string[];
      pathPrefixes?: string[];
      argumentNames?: string[];
    };
  };
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
  "appliesWhen": {
    "action": {
      "tools": ["write_file"],
      "pathPrefixes": ["src/components", "src/pages"]
    }
  },
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

Events belong to a host-provided `sessionId` and `taskId`. The verifier keeps an
in-memory ledger; the Claude adapter replays a local append-only JSONL ledger
across independent hook processes. Remote identity and hosted storage remain
later concerns.

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
  source: 'observed',
});

miko.record({
  taskId: 'new-settings-page',
  type: 'reference_read',
  path: 'docs/design-system.md',
  source: 'observed',
});

const beforeEdit = miko.verifyAction({
  taskId: 'new-settings-page',
  tool: 'write_file',
  arguments: { path: 'src/Settings.tsx' },
  risk: 'medium',
});

const completion = miko.verifyCompletion('new-settings-page');

// { decision: 'REVIEW', missing: ['check_passed:rendered-ui-review'] }
```

The result must be explainable and machine-readable. The alpha does not need an
LLM call: ambiguous semantic matching returns `REVIEW`.

Implementation: [`packages/koma-miko`](../../packages/koma-miko/README.md).

---

## 6. Alpha Scope and Acceptance Tests

The public alpha implements the deterministic library plus narrow Claude Code,
Codex, Gemini, and DeepSeek Harness adapter mappings.

### Included

- Contract schema validation
- Root `miko.json` Agent Specs, JSON Schema, and offline `miko doctor` with
  Claude/Codex/Gemini host selection
- Required-skill/reference checks
- Pre-action allow/deny/risk/scope checks
- Completion evidence checks
- In-memory verifier state plus a privacy-minimized local JSONL Claude adapter ledger
- Audited non-ALLOW decisions without prompt, code, or model-response persistence
- Evidence provenance (`observed`, `external`, `asserted`)
- Explicit and tool/path-driven contract activation
- `ALLOW`, `DENY`, and `REVIEW` with stable reason codes
- A Claude Code adapter covering `UserPromptExpansion`, `PreToolUse`,
  `PostToolUse`, `PostCompact`, and `Stop`
- Codex and Gemini Hook adapters with independent-process JSONL state and
  host-native denial/recovery mappings
- A native text/approval interaction (`ALLOW / DENY / REVIEW` to
  `allow / deny / ask`)
- Ten deterministic skill-contract replay profiles
- A zero-API scale replay for 100/1,000 Agent Specs and 10,000 evidence events
- Context epochs for Skills that must be reloaded after compaction
- Append-only JSONL plus a materialized snapshot and ledger-tail replay
- One opt-in, budget-capped Haiku live fixture for the narrow enforced UI path

### Not included

- **A planner or task decomposition engine**
- **Automatic skill selection from raw conversation history**
- **Context-window/token monitoring**
- **A validated claim about model behavior at near-million-token / 100-skill scale**
- **A generic agent runtime**
- **Durable telemetry, dashboards, or hosted policy service**
- **An LLM classifier**
- **Automatic rewriting of tool calls**

### Must-pass cases

1. UI task starts without `product-design` evidence → `REVIEW`.
2. UI `Edit` under an enforced path starts without observed skill evidence → `DENY`.
3. Agent claims it loaded a skill but the host did not observe it → still `REVIEW`/`DENY`.
4. Skill is loaded, but a forbidden tool is proposed → `DENY`.
5. All actions pass, but required UI review/test evidence is absent → `REVIEW`.
6. All trusted evidence is present → `ALLOW`.
7. A non-applicable contract does not affect an unrelated task.
8. Invalid/unknown evidence never silently satisfies an obligation.
9. A real Claude Code run produces `DENY → observed skill → changed artifact`
   while Miko persists neither prompt nor code content.
10. A context-fresh Skill becomes missing after `PostCompact` until it is
    observed again.
11. One hundred overlapping Agent Specs keep their full machine-readable result
    while the developer-facing terminal summary remains bounded.
12. Codex and Gemini Hook processes preserve the same deny/recovery/evidence
    semantics without persisting patch, prompt, or tool-response content.
13. A host quota, timeout, trust prompt, or missing Hook is reported as a host
    evaluation failure rather than being counted as model compliance.

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

## 8. Roadmap

The maintained positioning, evidence-ledger caveats, MCP adapter scope, scale
matrix, and executable TODO are in the
[Miko developer roadmap](./miko-roadmap.md).
