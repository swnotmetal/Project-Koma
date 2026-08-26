# Miko × DeepSeek Harness adapter validation

Date: 2026-08-26

Status: **native adapter, no-model host load, and one narrow paid recovery run
pass; package remains private**.

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
and no other fixture file changed. This proves the native recovery path once; it
does **not** establish a model recovery rate. The committed `eval:dsh-live`
runner makes the same experiment repeatable and disables the title request for
future runs.

## What remains before npm publication

1. Decide whether restart/hot-reload support must replay Miko state from DSH's
   durable session log in the first public version. Until then, document the
   live-session limitation prominently.
2. Install a real packed artifact after `koma-miko` itself has a resolvable npm
   version; the current local bundle links the unpublished workspace package.
3. Repeat the bounded run enough times to report recovery rate and token/latency
   overhead instead of presenting one successful trajectory as reliability.
4. Re-run the matrix before widening the exact DSH peer versions. Developer
   Preview compatibility must not be inferred from one RC.

## Claim boundary

This validation shows that the deterministic adapter loads and maps observable
DSH lifecycle events correctly. **It does not show that a model will recover
reliably, understand a loaded Skill, or obey it in a very long context.**
