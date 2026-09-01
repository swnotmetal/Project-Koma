# Miko host-adapter alpha evaluation

Date: 2026-08-27. These are narrow integration signals for the pinned host
versions, not reliability claims about any model or editor.

## Offline conformance

The non-Claude adapters pass their independent-process tests without an API key:

```text
Codex  PASS · DENY → exact Skill reload → observed evidence → ALLOW · 6 steps
Gemini PASS · DENY → activate_skill → observed evidence → ALLOW · 6 steps
VS Code PASS · DENY → explicit SKILL.md read → observed evidence → ALLOW · 6 steps
```

The assertions include a privacy check: patch text, file contents, and tool
responses do not appear in the Miko JSONL ledger. The host-specific Hook output
is checked separately from the verifier decision so a host cannot silently
turn a deny into an allow.

## VS Code Copilot

The adapter targets the documented VS Code Agent Hooks Preview surface rather
than the Language Model Tool extension API. Its offline fixture covers
`PreToolUse`, successful `PostToolUse`, `PreCompact`, and the nested `Stop`
decision shape. It also splits `editFiles` arrays into independently checked
paths and verifies that edit content and `tool_response` are absent from the
ledger.

This is not yet a live-editor pass. VS Code tool names can vary by model and
request, and native Copilot Skill injection might not emit an observable read.
The first tester run should capture Agent Debug Logs and confirm the exact tool
names plus an explicit `SKILL.md` recovery read before widening the profile.

## DeepSeek Harness

The DeepSeek live fixture passed once with the official
`@deepseek-ai/dsh@0.1.1-rc.2` CLI and `deepseek-v4-flash`:

```text
6 agent requests · 3,983 input tokens · 805 output tokens ·
18,688 cache-read tokens · 0 completion steers · PASS
```

The observed sequence was `edit DENY → skill → read → read → edit → pwsh`,
with the final Hero artifact matching the fixture. The DSH package required
explicitly installing its undeclared peer closure in a disposable runtime;
this is an upstream packaging issue, not a Miko dependency change.

## Codex

The first live attempt reached Codex CLI without an API key but stopped at the
account usage limit. On 2026-09-01, the five project Hooks were reviewed and
trusted in Codex CLI, then a minimal turn ran through the existing ChatGPT login
with `gpt-5.6-luna`:

```text
SessionStart Hook → model replies OK → Stop Hook
4,579 tokens reported by Codex · local Miko task_started ledger written
```

That first phase was a **live activation smoke only**. It proved that the trusted project
Hook command can reach Miko and persist a privacy-minimized heartbeat. The turn
did not call `apply_patch`.

A subsequent live lab attempted a two-file patch before reading project files.
Miko denied the first `apply_patch`, named two missing Skills and one reference,
observed the three reads, and ultimately allowed the exact HTML/CSS changes.
Codex reported 17,266 tokens. This was not yet the clean target flow: Codex first
grouped the three PowerShell reads with semicolons, which the adapter treated as
a generic shell call and used to activate an unrelated `local-testing` Spec.
The model recovered by loading that extra Skill, but the added work was Miko
friction, not a user requirement. The adapter now recognizes unquoted
`Get-Content -Raw path` and semicolon-separated batches only when **every**
segment is a safe read; regression tests cover both the accepted all-read batch
and a rejected read-plus-command batch.

The post-fix third live run used the same trusted project and existing ChatGPT
login. A completion obligation required both target artifacts:

```text
apply_patch DENY
→ one safe grouped PowerShell read loads product-design + accessibility + reference
→ identical two-file apply_patch succeeds
→ snapshot recheck returns ALLOW / COMPLETE / CONTRACT_SATISFIED
10,252 tokens reported by Codex
```

No unrelated shell contract activated. The JSONL contains path/name/decision
metadata for the two Skills, reference, and artifacts, without the prompt,
source contents, or tool output. This is now a successful narrow CLI recovery
fixture, not a claim about arbitrary Codex tools or Desktop behavior.

The non-interactive `codex exec` transcript displayed the branded red denial,
but only generic `hook: SessionStart Completed`, `PostToolUse Completed`, and
`Stop Completed` lines for successful states. The heartbeat and completion
snapshot remain the deterministic checks for that runner.

### Codex CLI interactive hand-test

After installing the official standalone Codex CLI 0.152.0 and reusing the
existing ChatGPT login, an interactive run used the same two-file UX prompt in
the local lab. The CLI visibly rendered:

```text
🟢 Miko active
→ 🔴 Miko paused the first patch
→ two Skills + exact reference observed
→ 🟢 Miko recovered
→ local-testing observed before a fallback search command
→ exact HTML/CSS edits applied
→ 🟢 Miko verified COMPLETE
```

The fallback was needed because `rg` was unavailable in that terminal; Codex
used `Select-String` after satisfying the applicable local-command Spec. The
Stop receipt reported two Agent Specs and 16 observed evidence events, with no
prompt, source code, or tool output persisted by Miko. This is the fixed
interactive CLI UX baseline. Releases run only the existing disposable
`eval:codex-live` model-backed fixture; parser and schema regressions belong in
offline conformance tests.

### Codex Desktop hand-test after trust

A fresh Desktop task in the same local lab then exercised the user-facing path:

```text
first apply_patch DENY
→ grouped recovery read DENY (agent used the wrong reference path)
→ two Skills + exact reference observed individually
→ first retry reaches apply_patch but its indentation context is invalid
→ rg check DENY until local-testing Skill is observed
→ corrected two-file patch succeeds
→ snapshot recheck returns ALLOW / COMPLETE / CONTRACT_SATISFIED
```

The wrong grouped path was `.agents/skills/docs/interaction-brief.md`; the Agent
Spec required `docs/interaction-brief.md`. Rejecting it was correct verifier
behavior, not a grouped-read parser regression. The later `rg` command genuinely
matched the lab's shell Spec, so requiring `local-testing` was also expected.
The tester did not handle files or collect debug logs; the agent recovered and
the maintainer correlated the task with the privacy-minimized ledger afterward.

Desktop made Miko perceptible through agent commentary such as “Miko paused the
edit,” but did not expose a persistent branded green completion receipt. This is
a post-trust functional pass with a remaining presentation gap. It does not fix
the first-run problem: before CLI `/hooks` trust, the same Desktop project had
silently skipped all five installed Hooks.

The test also exposed an onboarding failure: before CLI `/hooks` trust, the same
local project had five correctly installed Hooks but Codex Desktop completed an
edit without a visible Miko intervention. Config presence and offline
conformance must therefore never be reported as live protection. Plugin-bundled
Hooks would still be subject to Codex review.

## Gemini

Gemini CLI `0.57.0` was installed and its workspace Skill discovery was
verified with the configured Google key. The runner maps the repository's
`GOOGLE_API_KEY` to the CLI's required `GEMINI_API_KEY` name inside the child
process only. A `gemini-2.5-flash-lite` headless live run still did not finish
within the 180-second runner timeout, so no Gemini live completion is claimed.
The first attempt also demonstrated that untrusted project-level Hook
fingerprints are skipped in headless mode; the runner now puts its Hook command
in an isolated trusted user settings layer via `GEMINI_CLI_HOME`.

## What this does and does not prove

- A host Hook can expose an observed Skill/reference/tool event to Miko.
- Miko can deny an applicable action and return host-native recovery text.
- The local append-only ledger can preserve decisions and evidence without
  persisting prompt, code, or model-output content.
- It does **not** prove that a model understood or followed the Skill.
- It does **not** cover hosted tools, unobserved native Skill injection,
  editor-specific wrappers, or future host event schemas.
- It does **not** validate near-million-token context behavior or 100-Skill
  selection.
