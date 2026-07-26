# Koma Gate

Semantic request filtering for AI apps.

This package exposes a compact intent-classification guard that returns a strict JSON decision and is designed to sit in front of LLM calls, tool calls, or support workflows.

## AI Agent Quick Read

- Read order: this README, then `src/index.ts`, then [../../demo/server.js](../../demo/server.js).
- Boundary: decide whether an input is in scope before any model or tool work begins.
- Output shape: strict JSON decision plus middleware helpers.
- Primary use: guard the request path, not the downstream business logic.

## Agent Handoff

- Input: a short user request or route text.
- Output: allow or reject, plus a JSON decision object.
- Control point: `createGeneralKnowledgeGuard()`, `createCodeAssistantGuard()`, or `createSupportGuard()`.
- Common mistake: treating this layer as an intent router instead of a guard.

## Entry Point

- Source entry: `src/index.ts`
- Import from this monorepo: `./src`

## Install

Source-first. Use the package from the workspace or bundle it into a build pipeline.

## Usage

```ts
import {
  createGeneralKnowledgeGuard,
  createCodeAssistantGuard,
  createSupportGuard,
} from './src';

const guard = createGeneralKnowledgeGuard();

app.post('/api/query', guard.middleware(), async (req, res) => {
  res.json({ ok: true });
});
```

## Exports

- `KomaGuard`
- `GuardConfig`
- `GuardResult`
- `GuardDecision`
- `createGeneralKnowledgeGuard()`
- `createCodeAssistantGuard()`
- `createSupportGuard()`
- `createReferenceToolGuard()`
- `buildClassificationPrompt()`

## What It Solves

- off-topic requests
- prompt injection attempts
- instruction override attempts
- noisy or meaningless input
- basic abuse filtering before expensive model calls

## Notes

- English-first source and prompts
- low token budget
- fail-open by default for availability
- easy to swap between local and hosted LLMs