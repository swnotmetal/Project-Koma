# Koma Gate

Semantic request filtering for AI apps.

This package exposes a compact intent-classification guard that returns a strict JSON decision and is designed to sit in front of LLM calls, tool calls, or support workflows.

## Entry Point

- Source entry: `src/index.ts`
- Import from this monorepo: `./src`

## Install

This repository is source-first. Use the package from the workspace or bundle it into your own build pipeline.

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

- `VibeShieldGuard`
- `GuardConfig`
- `GuardResult`
- `GuardDecision`
- `createGeneralKnowledgeGuard()`
- `createCodeAssistantGuard()`
- `createSupportGuard()`
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