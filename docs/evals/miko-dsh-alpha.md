# Miko × DeepSeek Harness adapter validation

Date: 2026-08-26

Status: **`koma-miko@0.1.0-alpha.1` and `koma-miko-dsh@0.1.0-alpha.1` are public;
native tests, registry installation, no-model host load, and three narrow
packed-artifact recovery runs pass**.

## Pinned host contract

The experiment targets the published DeepSeek Harness Developer Preview
`0.1.1-rc.2` family and Cordis `4.0.1`. The source imports the official public
types for:

- `tools/pre-execute` and `PreToolDecision`;
- immutable `tools/result` outcomes;
- `agent/session-start` and `agent/turn-stopping`;
- plugin-sourced `UserMessage` steering.

All DSH/Cordis packages are peer dependencies in the distributable package.
The root development install resolves one deduplicated copy of
`@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-agent`, and
`@deepseek-ai/cordis`.

## Deterministic behavior result

The adapter suite passes 10/10 cases covering:

1. writes remain blocked until required Skill/reference evidence is observed;
2. successful final outcomes become evidence, while failed/background calls do not;
3. exact foreground shell matches may become named passing checks;
4. `REVIEW` maps to DSH `ask` or a configured deny;
5. completion steering is bounded;
6. `run_code` is transport while native sub-calls remain guarded;
7. a missing Agent Spec follows the configured fail-open warning path;
8. compaction invalidates Skills marked `reloadAfterCompaction`;
9. resume starts a fresh evidence epoch and requires Skill reload;
10. unknown tools receive conservative risk with explicit override support.

The full Koma suite passes 132/132 tests, and every workspace typecheck passes.

## Real host smoke result

Using an isolated temporary `DSH_HOME` and the published
`@deepseek-ai/dsh@0.1.1-rc.2` CLI:

- local bundle installation into a disposable profile succeeded;
- `--dump-config` included the `koma-miko-dsh` row and defaults;
- the DSH Web host booted with the adapter enabled;
- `http://127.0.0.1:3080/` returned HTTP 200;
- an npm dry-run pack contained only the intended runtime, declaration,
  live-eval runner, example, README, and bundle-patch files (10 entries, about
  16.5 KB packed).

No model endpoint or API credit was used for those host-smoke checks. Temporary
DSH host files were not added to the repository.

## Bounded live model result

A disposable headless profile used Anthropic's `claude-haiku-4-5` with retries
disabled and a maximum of 768 output tokens per agent request. A temporary
budget plugin restricted the tool catalog and stopped the run above eight agent
requests. The session log recorded seven agent steps plus one separate 64-token
title request, so the observed run stayed within the promised eight-request
ceiling.

The durable DSH log—not the assistant's final prose—showed this sequence:

1. the first `edit` was `DENIED_BY_MIKO`;
2. `skill(product-design)` succeeded;
3. `read(docs/design-system.md)` succeeded;
4. a later `edit(src/ui/Hero.tsx)` succeeded;
5. the exact foreground `pwsh` check succeeded with `isError: false`;
6. the turn ended with zero Miko completion-steer messages.

The final fixture contained the required Skill marker and `After Miko` heading,
and no other fixture file changed. The committed `eval:dsh-live` runner makes
the experiment repeatable and disables the title request.

### Three-run packed-artifact result

After `koma-miko@0.1.0-alpha.0` was resolvable from npm, the adapter runtime was
installed from a tarball into three fresh DSH profiles. Each run used the same
hard request/token/tool limits.

| Run | Recovery | Model phase | Agent requests | Input | Output | Cache read | Cache write |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | pass | 19.832 s | 7 | 11,571 | 1,077 | 14,803 | 5,395 |
| 2 | pass | 18.719 s | 7 | 7,531 | 1,034 | 19,189 | 5,345 |
| 3 | pass | 19.723 s | 7 | 11,558 | 1,113 | 14,742 | 5,368 |
| **Total / mean** | **3/3** | **19.425 s mean** | **7 mean** | **30,660** | **3,224** | **48,734** | **16,108** |

Miko denied the first relevant edit in 3/3 runs, recovery completed in 3/3,
and no run needed a completion steer. In two runs Haiku performed one harmless
read before the instructed first edit; that instruction-following miss did not
bypass the protected action.

Using Anthropic's
[published Haiku 4.5 pricing](https://www.anthropic.com/claude/haiku) and the
standard five-minute cache rates, the recorded three-run usage is approximately
USD 0.072. This is an estimate, not a billing statement. The sample is
intentionally tiny: **3/3 demonstrates the release path, not a 100% general
recovery claim.**

## What remains before widening support

1. Re-run the matrix before widening the exact DSH peer versions. Developer
   Preview compatibility must not be inferred from one RC.
2. Add a larger, separately budgeted evaluation before making model-reliability
   or long-context claims.

The restart decision for the first alpha is now explicit: every DSH
resume/restart begins a fresh Miko evidence epoch. Skills, references, artifact
changes, and checks must be observed again; durable replay is deferred.

The final public `alpha` tags point to `.1`. The `.1` correction updates release
metadata and public documentation after `.0` shipped with a stale
"not published" README; verifier and adapter runtime behavior are unchanged.
Installing `koma-miko-dsh@alpha` into a fresh registry-only DSH profile resolved
both `.1` packages and loaded the bundle successfully.

## Claim boundary

This validation shows that the deterministic adapter loads and maps observable
DSH lifecycle events correctly. **It does not show that a model will recover
reliably, understand a loaded Skill, or obey it in a very long context.**
