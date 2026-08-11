# Koma Gate

LLM-based scope classifier for AI apps.

This package exposes a compact intent-classification guard that returns a strict JSON decision and is designed to sit in front of LLM calls, tool calls, or support workflows.

## Security Boundary

Koma Gate is a scope classifier, not a cryptographic prompt-injection defense. Policy text and user input are sent together in one model message, so an attacker with sufficient control over the input may influence the classifier. For stronger guarantees:

- Use a provider that supports system/user message separation (OpenAI, Anthropic).
- Set `failOpen: false` in production if availability is less critical than security.
- Evaluate against public jailbreak corpora before relying on Gate as a primary defense.
- See [SECURITY-HARDENING.md](../../SECURITY-HARDENING.md) for known limitations and their status.

Gate is most effective as a first-pass filter that blocks obvious abuse and off-topic traffic before expensive model calls — not as a sole security boundary.

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

## Benchmarks

Evaluated against [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections) (263 attacks + 50 domain-aligned queries) in fail-closed mode. See [BENCHMARKS.md](../../BENCHMARKS.md) for full methodology.

| Provider | Model | Recall | Precision | FPR |
|----------|-------|:------:|:---------:|:---:|
| DeepSeek | deepseek-chat | 92.8% | 100.0% | 0.0% |
| Google | gemini-2.5-flash | 96.2% | 100.0% | 0.0% |

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
- Low token budget (~500 input tokens per classification).
- Fail-open by default for availability.
- Swap between local and hosted LLMs via the adapter config.