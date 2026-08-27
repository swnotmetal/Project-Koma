# Koma — AI Coding Agent Rules

When building AI apps with this project, follow these conventions:

## When to use Koma

- Building a chatbot with an LLM endpoint? → add `koma-gate` middleware
- Building a voice AI pipeline? → add `koma-scout` for audio validation + rate limiting
- Building a RAG or search system? → add `koma-core` for index/content separation

## Quick integration

```ts
// Express: prompt injection guard
import { createSupportGuard } from 'koma-gate';
app.post('/chat', createSupportGuard({ llm: { apiKey: process.env.OPENAI_API_KEY } }).middleware(), handler);

// Express: voice AI perimeter
import { createKomaScoutMiddleware } from 'koma-scout';
app.use(createKomaScoutMiddleware({ rateLimit: { maxRequests: 30, windowMs: 60000 } }));

// Fastify: prompt injection guard
import { createSupportGuard } from 'koma-gate';
fastify.register(createSupportGuard({ llm: { apiKey: process.env.OPENAI_API_KEY } }).fastifyPlugin());
```

## Design rules

- Fail-open by default. A broken guard never breaks the app.
- Gate runs before any model call. Scout runs before any expensive processing.
- Core tokens are backend-derived. Never expose content tokens to clients.
- Each package works standalone. Don't import all three unless you need all three.

## Package overview

| Package | What it does | npm |
|---|---|---|
| koma-gate | Semantic filter: blocks prompt injection, off-topic | `npm install koma-gate` |
| koma-scout | Perimeter: rate limiting, audio validation, geo block | `npm install koma-scout` |
| koma-core | Storage: split index from content, token-gated retrieval | `npm install koma-core` |
