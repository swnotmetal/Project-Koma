# koma-miko (alpha)

<p align="center">
  <img src="./assets/miko-lockup.png" alt="Koma Miko" width="420" />
</p>

Local checks for required Skill reads in **Claude Code and Codex CLI**.

When an agent tries to edit a protected file before reading a required Skill,
Miko pauses the action, names the missing evidence, and gives the agent a path
to retry. You define the requirements in a project-owned `miko.json`
**Agent Spec**. Miko runs locally, is MIT licensed, and makes no LLM calls.

Miko checks observable evidence at three points:

1. **Prepare** — were the required skills and references loaded?
2. **Pre-action** — is the proposed tool, risk, and path scope allowed?
3. **Complete** — did the required tests, reviews, or artifacts actually happen?

## Quick start

Use the setup for your host from the project root. Miko does not install Skills;
the generated `miko.json` must name Skills and paths that exist in your project.
The public alpha API may change before the first stable release.
The starter uses `frontend-design` and `src`; replace them if your project uses
different names, or pass `--skill <name> --path <prefix>` to `init`.

### Claude Code

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host claude
```

Edit `miko.json`, then check the configuration:

```sh
npx koma-miko doctor --host claude --strict
```

Start a new Claude Code session after changing Hooks. Ask for a small edit under
the configured path. If preparation is missing, the expected flow is
`edit paused → required Skill/reference read → edit retried`.
If the agent already read the required material, no recovery pause is needed.
The checks require the host to enable and emit the configured Hook events.

<a id="codex-setup"></a>

### Codex CLI (Technical Preview)

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host codex --enforce
```

Edit `miko.json` to match your project. Open Codex CLI in that project, run
`/hooks`, review and trust the five Miko Hooks, then run one small turn.

```sh
npx koma-miko doctor --host codex --strict
```

**Installation is not activation.** Codex skips untrusted project Hooks.
Codex Desktop requires prior CLI activation; Desktop-only onboarding is not a
supported alpha path. Codex uses `enforce`; `review` degrades to a recoverable
pause/deny rather than a native approval choice.

Want to inspect the behavior first? The [browser replay](https://koma-demo.swbuilds.workers.dev)
needs no installation. `npx --yes koma-miko@alpha demo` runs a deterministic
terminal replay without an API key. Both are demonstrations, not live host tests.

<a id="host-support"></a>

## Current host support

Focus reviewed **2026-09-03**. These are narrow alpha paths, not a promise of
identical behavior across editors, models, or organization policies.

| Host | Current scope |
|---|---|
| **Claude Code** | Primary alpha workflow; CLI denial, recovery, completion, and guided scope exceptions have been exercised live. |
| **Codex CLI** | Primary focus, **Technical Preview**; a fixed live recovery flow passed after explicit Hook trust. |
| Codex Desktop | Tested after CLI activation; no standalone onboarding promise. Status presentation depends on the host and agent relay. |
| Gemini CLI | Outside active development. Offline conformance passed; the recorded live attempt timed out. |
| VS Code Copilot | Adapter work paused until a tester can use it. Existing code and limited live observations remain available. |
| DeepSeek Harness | Separate experimental [adapter](../koma-miko-dsh/README.md) for a pinned Developer Preview; not the primary onboarding path. |

See the dated [Claude](../../docs/evals/miko-claude-haiku-alpha.md) and
[host-adapter](../../docs/evals/miko-host-adapters-alpha.md) evaluations for the
tested versions and limitations.

<a id="when-to-use-miko"></a>

## When to use Miko

Use Miko when you already have project Skills or references and repeatedly need
to check that an agent loaded them before editing. It can also require trusted
completion evidence when your integration records that evidence.

A small native Hook is enough for one fixed check. Miko adds reusable Specs,
observed-read tracking, reload requirements after compaction, recovery text,
and a local evidence ledger. It cannot prove comprehension, prevent every bad
edit, or check actions that bypass the configured host events.

**No MCP server is needed.** Miko's enforcement comes from host Hooks. A tool
that the model may choose to call cannot by itself require those checks before
other tools run. Koma's existing MCP servers belong to Gate and Core.

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
      "mode": "guided"
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
    mode: 'guided',
  }],
});

miko.startTask({
  sessionId: 'session-7',
  taskId: 'new-settings-page',
  tags: ['ui'],
});

// Guided mode pauses this deterministic gap for agent recovery, without asking
// the user to approve the same edit repeatedly.
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

// Guided mode pauses completion until both checks have been recorded.
miko.verifyCompletion('new-settings-page');
```

Choose the interaction once during initialization, then override it per Spec:

- `guided` (default except Codex): missing Skills, references, and completion
  evidence pause for agent recovery; allowlist, risk, and path exceptions ask
  the user. Claude CLI uses a branded `Allow once | Keep current scope`
  handshake; other hosts use the strongest review surface they expose.
- `review`: every missing-evidence gap asks the user. This is intentionally
  approval-heavy and can interrupt one multi-edit task more than once.
- `enforce`: evidence gaps and policy violations deny the proposed action.
  Explicitly denied tools always deny in every mode.

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
structured `PreToolUse` output when an integration explicitly wants a complete
three-way mapping:

- `ALLOW` → `allow`
- `DENY` → `deny`
- `REVIEW` → `ask`

Non-ALLOW results also include a concise `systemMessage` for the user and
`additionalContext` for the agent. Miko Verifier has no graphical UI: each host
renders the same structured decision using its native text/approval surface.
Those native surfaces now use one visible status language across adapters:
`🔴 Miko paused/blocked` for DENY, `🟡 Miko needs your decision` for REVIEW,
`🟢 Miko recovered` when newly observed evidence clears PREPARE, and a compact
`🟢 Miko verified` one-line receipt when the active Agent Specs reach COMPLETE.
When no Spec applies, the closing status is `⚪ Miko active · no Agent Spec
applied; no verification claimed.` This means the configured selectors did not
match; it does not mean the answer is correct or no Skill is needed. Exact
missing evidence remains in agent context and the local ledger.

The compact closing receipt and Codex `PostToolUse` status relay require
`0.1.0-alpha.11` or later. Older installations need to be updated.

Packaged adapters apply one interaction rule consistently: an `ALLOW` defers to
the host's existing permission policy, a `REVIEW` opens the host's native
approval path, and a `DENY` blocks only the proposed action while giving the
agent recovery context. Recoverable denials should therefore be retried by the
agent without asking the user to repair Miko state manually. The shared
`toHostInteractionDecision(result)` helper exposes this as
`defer | ask | deny`; the packaged Claude adapter intentionally emits no
explicit `allow` even though the lower-level Claude mapper can produce one.

**Claude CLI guided review:** for an allowlist, risk, or path exception, Miko
first shows its yellow reason and asks Claude to open one branded question with
`Allow once` and `Keep current scope`. An approval is SHA-256-bound to the full
normalized tool call, consumed by one exact retry, and cannot approve a changed
or later action. The ledger stores only the fingerprint and bounded review
metadata. A real Claude Code 2.1.257 / Haiku 4.5 run exercised both choices:
Allow once performed the exact edit and Keep current scope made no edit.

Raw `mode: "review"` preparation gaps still use Claude's native `ask` mapping.
That dialog may omit Miko attribution and can be approval-heavy, so `guided`
remains the default. Miko does not enable session-wide edit auto-approval.

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

To try the alpha in a Claude Code project, install it and let the initializer
wire the local files for you:

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host claude
```

`init` creates a `guided` starter `miko.json`, except that Codex defaults to
`enforce` because its current PreToolUse Hook cannot open a native review
choice. Guided mode keeps routine missing-evidence recovery with the agent and
asks the user only about policy exceptions. It merges the required Claude Hooks into `.claude/settings.json`
without replacing unrelated settings, backs up an existing settings file
before changing it, and adds `.miko/state/` to
`.gitignore`. Run it again safely; it is idempotent. Use `--skill <name>` and
`--path <prefix>` to tailor the starter spec, or choose once with
`--mode guided|review|enforce`; the generated mode can later be changed per
Spec. Start a new Claude session after changing Hooks.
Use `--dry-run` to preview changes. For the other primary path, follow the
[Codex setup](#codex-setup). Retained experimental layouts are documented under
[other adapters](#other-adapters).

The initializer does not overwrite an existing `miko.json`; edit that file to
match your project. Miko writes session metadata under `.miko/state/`, which
should stay ignored. Legacy `.miko/contracts.json` arrays remain readable but
are no longer the preferred developer interface.

### Codex CLI Technical Preview: installation is not activation

`npx koma-miko init --host codex` can install the Agent Spec and five project
Hooks, but it cannot make Codex trust executable project code. Non-managed
Codex Hooks are reviewed by exact command hash and are skipped until the user
trusts them. The current reliable first-run path is:

```text
1. Run: npm install -D koma-miko@alpha
2. Run: npx koma-miko init --host codex --enforce
3. Start Codex CLI in that project and run: /hooks
4. Trust the five Miko Hooks, then send one small turn
5. Run: npx koma-miko doctor --host codex --strict
```

Codex initialization defaults new Agent Specs to `mode: "enforce"`. An
explicit `--mode review` remains valid, but Codex cannot currently open the
native PreToolUse choice requested by Miko, so `REVIEW` is reported as a
recoverable pause/deny. `doctor --host codex --strict` warns when review-mode
Specs are present.

The last command passes the new activation check only after Miko has observed a
real `SessionStart` heartbeat written after the current Hook config. A heartbeat
proves at least one live session reached Miko; it does not guarantee that trust
will survive a later Hook command change or that every Codex tool emits Hooks.
The adapter also returns branded `SessionStart` context. Interactive Codex CLI
0.152.0 displayed the branded active, recovered, and COMPLETE messages in the
2026-09-01 hand-test; non-interactive `codex exec` can still collapse successful
states to generic Hook-completed events. No extra model turn is added merely to
manufacture a green receipt.

For hosts that hide successful Hook messages, Codex also receives a short
`PostToolUse` status to relay in its next normal progress message. Identical
passive statuses are suppressed within a turn; a changed applicable Spec set or
status can be reported again. Without `turn_id`, deduplication resets at `Stop`.
These messages describe observed checks **so far**, not approval of the whole
answer. Startup asks for one active notice. No extra model turn or native
permission approval is introduced; agent relay is not a persistent Desktop UI,
and a tool-free turn still relies on the host's closing-message presentation.

**Codex Desktop requires prior CLI activation and is not a supported standalone
alpha onboarding path.** In the current local test, Desktop allowed an edit
while all five installed project
Hooks were still untrusted; the review became obvious only after opening Codex
CLI. If the `codex` command is not available, do not interpret a successful
`init`, Hook config check, or offline `probe` as protection. Miko deliberately
does not automate trust, and packaging it as a Codex plugin would not remove
Codex's review requirement.

Run an entirely offline preflight before spending model credits:

```sh
npx koma-miko probe --host claude
npx koma-miko probe --host codex
npx koma-miko doctor --host claude --strict
npx koma-miko doctor --host codex --strict
```

`probe` runs the selected adapter through an isolated `DENY -> evidence ->
ALLOW` conformance fixture, checks that prompt, source, and tool output content
stay out of the JSONL ledger, and removes the fixture. It never invokes a model
or modifies the current project. Use `--json` for the same privacy-safe report
in machine-readable form. Its report explicitly marks runtime activation as
`NOT CHECKED`. This is an adapter check, not proof that an installed host trusts
the Hook or emits identical events and tool names.

Doctor validates Agent Specs and reports host-specific Skill discovery, required
Hook coverage, and whether `.miko/state/` is ignored. For Codex it separately
reports configured Hooks and an observed live runtime heartbeat. It defaults to Claude;
select the matching host when checking another layout. It never calls a model
or reads an API key.

Claude Code's local CLI, Desktop Code tab, and VS Code/Cursor extension share
settings, hooks, and skills. Cloud/remote sessions have different configuration
sources, and managed policies can disable project hooks, so adapters must expose
their detected capabilities rather than promise identical behavior everywhere.
See the official [platform overview](https://code.claude.com/docs/en/platforms),
[Desktop shared configuration](https://code.claude.com/docs/en/desktop), and
[VS Code settings](https://code.claude.com/docs/en/ide-integrations).

## Codex adapter details

The Codex adapter maps the host's events to Miko's shared verifier:

- `koma-miko-codex-hook` consumes Codex `SessionStart`, `PreToolUse`,
  `PostToolUse`, `PostCompact`, and `Stop` events. Codex currently parses but
  does not support `permissionDecision: ask` from `PreToolUse`, so both
  `REVIEW` and `DENY` pause the proposed call with
  `permissionDecision: deny`. A review pause explains the host limitation and
  tells the agent to load missing evidence or ask the user to revise the Agent
  Spec. The adapter deliberately does not emit `allow`, so Codex's own
  permission policy remains authoritative. See the official
  [Codex Hooks reference](https://learn.chatgpt.com/docs/hooks#pretooluse).
  `apply_patch` targets
  are recorded as path metadata only, and the adapter recognizes a tiny,
  read-only `Get-Content`/`cat` subset for Skill reloads.
<a id="other-adapters"></a>

## Other adapters

These implementations are retained for existing users and historical tests.
Gemini is outside active development. Copilot work is paused pending real
tester availability. Their presence in the package does not imply the same
support level as Claude Code or Codex CLI. DeepSeek Harness has its own
[experimental package](../koma-miko-dsh/README.md).

<details>
<summary>Gemini and VS Code Copilot setup and implementation details</summary>

The initializer still accepts `--host gemini` and `--host vscode`
(`--host copilot` is an alias). Use the same host with `probe` or `doctor`.

- `koma-miko-gemini-hook` consumes Gemini `BeforeTool`, `AfterTool`,
  `SessionStart`, `PreCompress`, and `AfterAgent` events. It maps `DENY` to
  `decision: deny`, maps `REVIEW` to the current CLI's interactive
  `decision: ask` path, and records only successful tool metadata. A
  non-interactive Gemini run has no user to ask and can therefore treat review
  as denial. Older Gemini CLI releases that predate Hook `ask` need updating.
  Project-level Gemini hooks may require the user to trust the hook fingerprint;
  headless automation should install the command in a trusted user settings
  layer, as the live runner does.
- `koma-miko-vscode-hook` consumes VS Code `SessionStart`, `PreToolUse`,
  `PostToolUse`, `PreCompact`, and `Stop`. It uses the documented nested
  `permissionDecision: ask | deny` and stop outputs, splits multi-file edits
  into separately scoped paths, normalizes Copilot's observed
  `multi_replace_string_in_file` alias to the stable
  `replace_string_in_file` Agent Spec tool name, and never returns an explicit
  allow over VS Code's own approval policy. The
  initializer writes `.github/hooks/miko.json`; no extension or Miko API key is
  required.

For a small Copilot Agent-mode trial, point Miko at one existing project Skill:

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host vscode --skill product-design --path src --enforce
npx koma-miko doctor --host vscode --strict
```

That command uses `enforce` and tests automatic denial/recovery. To test a real
user choice instead, use a `guided` Spec whose preparation is already satisfied
and propose a risk, allowlist, or path exception. `review` remains available
for intentionally approval-heavy missing-evidence testing. VS Code should
surface Miko's `permissionDecision: "ask"` in its native approval UI. This is a
different test from the Codex recovery prompt. VS Code labels the two choices
**Allow Once** and **Skip**: Allow Once permits only the proposed call, while
Skip declines that call. In a live Copilot Agent-mode pass, Skip returned Miko's
yellow REVIEW reason to the agent; after the user chose to proceed, the agent
loaded the named Skill, retried the edit, and reached Miko COMPLETE. Skip does
not itself authorize an automatic retry, so that contract-following path needs
one short follow-up from the user.

Start a new Copilot chat, then request an edit under `src`. The expected first
pass is a Miko denial, followed by an explicit read of
`.github/skills/product-design/SKILL.md` (or the same Skill under `.agents` or
`.claude`) and a successful retry. Testers should not collect raw debug logs by
default. If no Miko message appears, run `doctor` first; only then should a
maintainer request one bounded **Developer: Show Agent Debug Logs** capture to
identify the real `tool_name`. VS Code Agent Hooks are currently Preview and can
be disabled by organization policy. Also, VS Code loads
`.claude/settings*.json` by default; `doctor` warns when it sees a Miko Claude
Hook that could execute alongside the dedicated adapter.

The integration follows the official [VS Code Agent Hooks guide](https://code.visualstudio.com/docs/agent-customization/hooks),
[Hook schemas](https://code.visualstudio.com/docs/agents/reference/hooks-reference),
and [Copilot Agent Skills locations](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills).

These are host adapters, not a promise that every editor, hosted session, or
specialized tool path emits the same events. Hosted tools can remain outside the
local ledger, and host response formats can only provide best-effort success
signals. In particular, a native Copilot Skill injection that produces no
documented tool event cannot count as observed evidence; the alpha recovery
path requires an observable `read_file` or narrowly recognized read-only
terminal command. See [`examples/codex`](./examples/codex),
[`examples/gemini`](./examples/gemini), and
[`examples/vscode`](./examples/vscode).

</details>

## Automated replay

Try the published alpha without cloning the repository:

```sh
npx koma-miko@alpha demo
```

This runs the ten deterministic Agent Spec profiles with no API key or project
configuration. For source-level development, the same replay can be run from
the repository with `npm run eval:replay -w koma-miko`.

`npm run eval:replay -w koma-miko` runs ten simplified skill contracts without
an API key. For every skill it verifies three cases: missing evidence, an agent
claim (`asserted`), and a host-observed load (`observed`). Only observed or
external evidence can satisfy a contract. The first UI case is the narrow
enforcement demo; the other nine remain review-only.
`npm run eval:claude-hook -w koma-miko` additionally spawns three independent
hook processes and verifies an audited `DENY → observed Skill → ALLOW` plus
ledger privacy.
`npm run eval:codex-hook -w koma-miko`, `npm run eval:gemini-hook -w koma-miko`,
and `npm run eval:vscode-hook -w koma-miko` run the same conformance flow
through independent Hook processes without an API key. The VS Code run covers
the documented Hook schema, not a live editor session. The Codex live runner
(`npm run eval:codex-live -w koma-miko`) uses an existing Codex CLI login
(`MIKO_CODEX_BIN`) and no OpenAI API key. The Gemini live runner
(`npm run eval:gemini-live -w koma-miko`) uses a parent-process
`GEMINI_API_KEY` or `GOOGLE_API_KEY` and an official Gemini CLI entry point
(`MIKO_GEMINI_ENTRY`). Both runners use disposable fixtures and never read an
env file.

For each Miko release, the Codex model-backed release check is intentionally
limited to this one fixed, disposable `eval:codex-live` recovery fixture. Add
offline conformance cases for parser or schema regressions; do not multiply paid
Codex scenarios unless the host API changes materially.
Publishing either Miko alpha package runs a mandatory `postpublish` guard that
sets both npm `alpha` and `latest` to the exact published version and reads the
tags back from the registry. A mismatch fails the release command. The
dedicated `Publish Miko alpha` workflow publishes Miko before its exactly pinned
DSH adapter; do not replace it with ad-hoc tag commands.
`npm run eval:scale -w koma-miko` uses no API key. It benchmarks 100/1,000 Agent
Specs, 10,000 indexed evidence events, 100 overlapping specs, and snapshot
restore while checking that terminal output remains bounded. See the dated
[scale reference](../../docs/evals/miko-scale-alpha.md); it is a local verifier
measurement, not a model benchmark.
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

A separate interactive Claude CLI hand-test used an ordinary Chinese request
to turn an unfinished static page into a client-facing page. The prompt named
no Miko concept, Skill, Hook, or file. Claude recovered from the first Miko
pause, loaded the project requirements, changed HTML/CSS/JavaScript, ran local
checks, and reached COMPLETE for 3 Agent Specs with 28 observed evidence
events. This is one bounded UX observation, not a general model benchmark.

## Alpha boundaries

- **No LLM call or semantic task classifier**
- **No planner, router, or agent runtime**
- **No context-window/token monitoring**
- **Cannot force a model to invoke or follow a Skill; it can only deny an
  observable action, return recovery text, and record the violation**
- **One Haiku/100-Skill fixture has passed at approximately 20k tokens; this is not evidence for 100k, 190k, or near-million-token behavior**
- **No hosted telemetry service** (the Claude adapter uses a local JSONL ledger)
- **Cannot observe hosted tools, editor wrappers, or remote sessions that do not
  emit the configured host Hook events**
- **Codex CLI is a Technical Preview and promotes enforce mode; review degrades
  to pause/deny because Codex PreToolUse cannot open Miko's native approval
  choice**
- **Codex Desktop requires prior CLI Hook activation; config presence and
  offline probe success do not prove activation**
- **VS Code Agent Hooks are Preview; the adapter has passed one live Copilot
  Agent-mode REVIEW recovery flow, not broad compatibility testing across
  models, tool names, editor versions, or organization policies**
- **Copilot can introduce new tool names without notice; the adapter only
  governs aliases it recognizes. Repeat live testing before resuming active
  support; current adapter work is paused**
- **No automatic rewriting of tool calls**
- **No claim that loading a skill proves the model understood, retained, or followed it**

See the [design and discovery notes](../../docs/design/miko.md), including the
first-hand failure case, public reports used as test discovery data, and the
post-alpha questions. See the [recovery playbook](../../docs/design/miko-recovery-playbook.md)
for recommended developer actions. Product positioning and executable follow-up
work live in the [developer roadmap](../../docs/design/miko-roadmap.md).
