# Koma Gate

LLM-based scope classification and semantic request filtering for AI apps.

Koma Gate sits before model or tool calls and returns a compact, structured allow/block decision.

## Security Boundary

Koma Gate is a scope classifier, not a cryptographic prompt-injection defense. A sufficiently adversarial input may influence the classifier itself.

- Prefer providers with system/user message separation.
- Set `failOpen: false` when security is more important than availability.
- Evaluate against representative benign and attack corpora before production use.
- See [SECURITY-HARDENING.md](../../SECURITY-HARDENING.md) for known limitations and mitigations.

Gate is best used as a first-pass filter before expensive model calls, not as the only security boundary.

## AI Agent Quick Read

- Read order: this README, then `src/index.ts`, then [../../demo/server.js](../../demo/server.js).
- Boundary: classify input before model, tool, or business work begins.
- Output: a strict decision object plus Express and Fastify helpers.
- Common mistake: treating Gate as a complete sandbox or authorization layer.

## Install

```bash
npm install koma-gate
```

## Usage

```ts
import { createSupportGuard } from 'koma-gate';

const guard = createSupportGuard({
  llm: { apiKey: process.env.OPENAI_API_KEY },
  behavior: { failOpen: false },
});

app.post('/support', guard.middleware(), handler);
```

## Benchmarks

Evaluated in fail-closed mode. See [BENCHMARKS.md](../../BENCHMARKS.md) for methodology and reproduction commands.

| Corpus | Provider | Recall | Precision | FPR |
|---|---|---:|---:|---:|
| EN (deepset) | Google | 96.2% | 100.0% | 0.0% |
| EN (deepset) | DeepSeek | 93.2% | 100.0% | 0.0% |
| ZH (zh-50) | DeepSeek | 100.0% | 100.0% | 0.0% |
| ZH (zh-50) | Google | 98.0% | 100.0% | 0.0% |

These results describe the recorded corpora and configurations, not universal prompt-injection immunity.

## Main Exports

| Export | Purpose |
|---|---|
| `createGeneralKnowledgeGuard()` | General factual and knowledge assistants |
| `createCodeAssistantGuard()` | Coding assistants and developer tools |
| `createSupportGuard()` | Customer-support workflows |
| `createReferenceToolGuard()` | Narrow factual lookup and reference tools |
| `KomaGuard` | Programmatic classification and middleware integration |
| `buildClassificationPrompt()` | Custom-domain prompt construction |

## Design Rules

- Run Gate before the protected model call.
- Keep the domain policy narrow and explicit.
- Treat fail-open/fail-closed as a deployment decision.
- Do not present an LLM classifier as a deterministic security proof.
