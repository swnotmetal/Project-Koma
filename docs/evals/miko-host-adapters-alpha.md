# Miko host-adapter alpha evaluation

Date: 2026-08-27. These are narrow integration signals for the pinned host
versions, not reliability claims about any model or editor.

## Offline conformance

Both adapters pass the independent-process test without an API key:

```text
Codex  PASS · DENY → exact Skill reload → observed evidence → ALLOW · 6 steps
Gemini PASS · DENY → activate_skill → observed evidence → ALLOW · 6 steps
```

The assertions include a privacy check: patch text, file contents, and tool
responses do not appear in the Miko JSONL ledger. The host-specific Hook output
is checked separately from the verifier decision so a host cannot silently
turn a deny into an allow.

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

The existing Codex CLI login was able to start the live fixture and enter a
model turn without an API key. The account then returned its usage-limit error
before the Miko completion sequence could finish. This run is recorded as
`host/quota failure`, not adapter success or model failure. The offline test
remains the reproducible gate until the account quota is available again.

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
- It does **not** cover hosted tools, editor-specific wrappers, or future host
  event schemas.
- It does **not** validate near-million-token context behavior or 100-Skill
  selection.
