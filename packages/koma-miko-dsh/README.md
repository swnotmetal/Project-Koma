# koma-miko-dsh (alpha)

Native DeepSeek Harness adapter for
[Koma Miko Agent Specs](../koma-miko/README.md). The first alpha targets the
exact DSH Developer Preview version verified below; later RC compatibility is
not implied.

## What it proves

The adapter uses three native DSH extension points:

| DSH event | Miko checkpoint | Behavior |
|---|---|---|
| `tools/pre-execute` | `PREPARE` / `PRE_ACTION` | `DENY` blocks; `REVIEW` uses DSH's native approval path |
| `tools/result` | evidence | Only a final `isError: false` result becomes observed evidence |
| `agent/turn-stopping` | `COMPLETE` | Missing obligations steer one more model step, with a bounded loop guard |

The normal CLI, Web UI, and any other DSH surface render the host's own approval,
tool-error, and steering interaction. Miko does not add a separate GUI.

DSH Code Mode is covered at the native sub-call boundary. The outer `run_code`
transport is delegated because each `tools.*` sub-call re-enters
`tools/pre-execute` and `tools/result`; Miko does not inspect or retain program
text.

## Install the alpha

```sh
dsh plugin --profile miko-lab add koma-miko-dsh@alpha
dsh --profile miko-lab --dump-config
```

For local development, build from the Koma root and install or link the package
into a disposable DSH profile:

Build from the Koma root, then install or link the package into a disposable DSH
profile:

```sh
npm run build -w koma-miko -w koma-miko-dsh
dsh plugin --profile miko-lab add ./packages/koma-miko-dsh
dsh --profile miko-lab --dump-config
```

Place a DSH-named `miko.json` in the session workspace. The narrow example is in
[`examples/ui-change`](./examples/ui-change). It expects DSH tool names such as
`skill`, `read`, `write`, `edit`, and `bash`, rather than Claude Code's
capitalized names.

### Repeat the bounded live evaluation

After building the package, set `ANTHROPIC_API_KEY` in the parent process and,
if `dsh` is not on `PATH`, point `MIKO_DSH_BIN` at the executable. Then run:

```sh
npm run eval:dsh-live -w koma-miko-dsh
```

The runner creates a disposable DSH home and fixture, installs the local bundle,
uses `claude-haiku-4-5`, disables title generation and telemetry, disables
retries, caps the run at eight agent requests and 768 output tokens per request,
and restricts the available tools. It then verifies the compressed DSH session
artifact rather than trusting the model's final claim. The API key is read only
from the process environment; the runner never opens an env file. Temporary
files are deleted unless `MIKO_DSH_KEEP_TEMP=1` is set.

Set `MIKO_DSH_PLUGIN_SOURCE` to an absolute `.tgz` path to test the exact packed
artifact rather than the workspace directory. A passing report includes the
observed tool sequence, request count, token usage, and model-run latency.

To turn an exact successful command into completion evidence, override the
bundle row in the profile's `cordis.patch.yml`:

```yaml
- id: koma-miko-dsh
  name: koma-miko-dsh
  config:
    specPath: miko.json
    checks:
      - name: targeted-tests
        tool: bash
        argument: command
        equals: npm test -- Hero
```

An `isError: false` result with that exact argument records only
`check_passed:targeted-tests`. The command, prompt, source code, model response,
and tool output are not copied into Miko evidence. Background commands never
count as a passing check because their successful result means only that a job
started.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `specPath` | `miko.json` | Agent Spec path relative to each session workspace |
| `taskTags` | `[]` | Deployment-owned tags; prompt text is never classified |
| `missingSpec` | `warn` | Warn once per unguarded workspace, or use `silent` |
| `reviewPolicy` | `ask` | Map `REVIEW` to DSH `ask`, or make it `deny` |
| `failureMode` | `open` | Adapter failures delegate; `closed` throws |
| `unknownRisk` | `high` | Conservative risk for unknown/custom tools |
| `riskOverrides` | `[]` | Exact `{ tool, risk }` deployment overrides |
| `checks` | `[]` | Exact successful-tool matches for named check evidence |
| `evidenceArgumentNames` | path keys only | Primitive arguments allowed into `tool_succeeded` evidence |
| `maxCompletionSteers` | `2` | Prevent a missing obligation from causing an infinite stop loop |

## Host dependency rule

`@deepseek-ai/cordis` and every `@deepseek-ai/dsh-*` package are peers, not
runtime dependencies. A DSH profile must resolve the host's one shared copy.
Shipping a second `dsh-tools` instance can split singleton symbols and break the
tool pipeline. The exact compile target for this experiment is DSH
`0.1.1-rc.2`. Peer versions are pinned exactly because compatibility with a
later Developer Preview is not assumed.

## Honest boundaries

- **Miko records that DSH successfully loaded a Skill; it cannot prove the model understood or followed it.**
- **This experiment cannot force a model to choose a Skill before the first relevant action; it can block that action and explain what is missing.**
- **The first alpha deliberately starts a fresh evidence epoch on every DSH resume/restart. Required Skills, references, artifact changes, and checks must be observed again.**
- **Live adapter state is not replayed from the DSH session log after process restart or plugin hot reload. This is an explicit alpha policy, not silent recovery.**
- **Completion steering is corrective, not an unbounded hard lock; the configured loop guard eventually lets the turn close.**
- **Exact command matching is deliberately narrow. Miko does not infer from arbitrary terminal text that tests passed.**
- **Miko complements DSH approval and sandbox policy; it does not replace either.**

The live host gate passes: three bounded Haiku sessions from a packed adapter
showed
`blocked write → observed skill/reference → allowed write → observed exact
check → allowed completion`. The measured 3/3 result is a narrow integration
signal, not a general model-reliability claim.

Current measured results are in
[`docs/evals/miko-dsh-alpha.md`](../../docs/evals/miko-dsh-alpha.md).
