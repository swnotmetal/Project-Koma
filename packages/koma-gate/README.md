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

```bash
npm install koma-gate
```

## Usage

```ts
import { createGeneralKnowledgeGuard } from 'koma-gate';

const guard = createGeneralKnowledgeGuard({
  llm: { apiKey: process.env.GEMINI_API_KEY }
});

app.post('/api/query', guard.middleware(), async (req, res) => {
  res.json({ ok: true });
});
```

## Exports

### Guard Factories

| Export | What it does | When to use |
|---|---|---|
| `createGeneralKnowledgeGuard()` | Blocks diagnosis, advice, off-topic. Allows science, tech, history. | Q&A bots, research assistants |
| `createCodeAssistantGuard()` | Blocks malware, exploits, cracking. Allows programming, architecture. | Coding copilots, CI bots |
| `createSupportGuard()` | Blocks medical/legal/investing advice. Allows billing, accounts, FAQ. | Customer support bots |
| `createReferenceToolGuard()` | Blocks diagnosis, role-manipulation, prompt extraction. Allows factual lookup. | Voice AI, medication info, doc search |

### Core Classes

| Export | What it does |
|---|---|
| `KomaGuard` | The main guard class. Call `guard.classify(text)` for programmatic use, or `guard.middleware()` for Express. |
| `buildClassificationPrompt()` | Builds the few-shot prompt from domain config. Useful for custom guard setups. |

### Config Types

`GuardConfig`, `GuardResult`, `GuardDecision` — TypeScript types for the full guard contract.

## What It Solves

- off-topic requests
- prompt injection attempts
- instruction override attempts
- noisy or meaningless input
- basic abuse filtering before expensive model calls

## Design

- English-first source and prompts.
- Low token budget (~500 tokens per classification).
- Fail-open by default for availability.
- Swap between local and hosted LLMs via the adapter config.