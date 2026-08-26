# Miko × DeepSeek Harness adapter validation

Date: 2026-08-26

Status: **release candidate passes native adapter tests, no-model host load, and
three narrow packed-artifact recovery runs**.

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

The adapter suite passes 9/9 cases:

1. an applicable write is denied before required Skill/reference evidence;
2. the exact missing `skill` and `read` preparation calls are allowed to repair
   the denial;
3. only successful final tool outcomes become evidence;
4. exact foreground shell matches may become named passing checks;
5. failed and background shell calls never become passing checks;
6. `REVIEW` maps to DSH `ask` by default and may be configured as `deny`;
7. completion steering stops at its configured bound;
8. `run_code` is treated as a transport while native sub-calls remain guarded;
9. compaction invalidates Skills marked `reloadAfterCompaction`.

The full Koma suite passes 131/131 tests, and every workspace typecheck passes.

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

## What remains before npm publication

1. Re-run the matrix before widening the exact DSH peer versions. Developer
   Preview compatibility must not be inferred from one RC.
2. Add a larger, separately budgeted evaluation before making model-reliability
   or long-context claims.

The restart decision for the first alpha is now explicit: every DSH
resume/restart begins a fresh Miko evidence epoch. Skills, references, artifact
changes, and checks must be observed again; durable replay is deferred.

## Claim boundary

This validation shows that the deterministic adapter loads and maps observable
DSH lifecycle events correctly. **It does not show that a model will recover
reliably, understand a loaded Skill, or obey it in a very long context.**
