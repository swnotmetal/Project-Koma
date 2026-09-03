# Koma architecture

Current source layout, reviewed 2026-09-03. Koma has four main packages and three
separate adapters. The packages are not one automatically connected pipeline.

## Packages and dependencies

| Package | Responsibility | Koma dependency |
|---|---|---|
| [koma-miko](packages/koma-miko/README.md) | Required Skill reads, proposed actions, completion evidence | None |
| [koma-gate](packages/koma-gate/README.md) | Semantic input classification before application model calls | None |
| [koma-scout](packages/koma-scout/README.md) | Request limits, audio upload checks, geographic rules | None |
| [koma-core](packages/koma-core/README.md) | Separate public search metadata from protected content | None |
| [koma-miko-dsh](packages/koma-miko-dsh/README.md) | Experimental DeepSeek Harness adapter | Exact Miko version plus pinned host peers |
| [koma-gate-mcp](packages/koma-gate-mcp/README.md) | MCP input-classification tool | Gate |
| [koma-core-mcp](packages/koma-core-mcp/README.md) | MCP search and retrieval tools | Core |

Package manifests define the actual dependency versions. Miko has no MCP server.

## Coding-agent path: Miko

    Claude Code / Codex host events
        -> host adapter normalizes observable reads and tool calls
        -> Miko checks the project's miko.json Agent Specs
        -> host continues, pauses, or requests a supported user choice
        -> observed results update the local ledger and snapshot
        -> completion checks produce a receipt

The verifier lives in packages/koma-miko/src/index.ts. Host adapters use the
shared host-adapter.ts interface; hook-runtime.ts persists the local state.
Claude Code and Codex CLI are the active focus. See the
[current support table](packages/koma-miko/README.md#host-support) for activation
requirements and the status of other adapters.

Miko does not override native permissions. A successful read does not prove
understanding or compliance, and events the host does not expose are outside
its evidence. Enforce-mode missing evidence denies the applicable action.

## Application path: Scout, Gate, Core

A developer can compose these independent packages where needed:

    Incoming request -> Scout's cheap checks -> Gate classification -> application
    Protected retrieval -> Core search metadata -> backend authorization -> content

Gate calls a configured classifier model. Scout and Core do not make LLM calls.
Core derives content tokens on the backend; public search results do not expose
those tokens by default. Failure settings belong to each package and entry point,
not to Koma as a whole. See [known limitations](SECURITY-HARDENING.md).

## Repository layout

- packages/: package source, host examples, schemas, and package documentation.
- demo/web/: the deployed browser demo. Cloudflare Worker routes live in src/;
  public/ contains static assets and the Miko replay fixture. Gate uses a real
  classifier; Miko is an explicitly labelled simulation.
- demo/server.js: a separate dependency-free local simulation used by Docker.
- docs/evals/: dated results and limits; preserve these as evidence.
- docs/design/: current design, recovery, and roadmap notes.
- docs/assets/: current Miko replay GIF and poster for sharing.
- logo/: the root README banner and the Scout/Core diagrams.
- scripts/: package smoke checks, release-tag checks, and Miko GIF assembly.
- benchmarks/ and examples/: evaluation inputs and runnable integration examples.

The demo has its own copies of the Koma and Miko marks because deployment uploads
only demo/web/public/. The Miko package assets also ship with its npm package.
Those deployment copies serve different consumers.

Maintainer-only handoffs, third-party Skills, local Hook configuration, and
experiments are ignored. See [AGENTS.md](AGENTS.md) and the
[release policy](VERSIONING.md).
