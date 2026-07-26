# Koma vs. Alternatives

A technical comparison for engineers evaluating AI defense toolkits.

---

## Quick Summary

| | Koma | Guardrails AI | NVIDIA NeMo Guardrails | LLM Guard | Custom Middleware |
|---|---|---|---|---|---|
| **Language** | TypeScript | Python | Python | Python | Any |
| **Runtime** | Node.js ≥18 | Python ≥3.9 | Python ≥3.8 | Python ≥3.9 | Any |
| **Package model** | 3 independent packages | Monolithic | Monolithic | Monolithic | — |
| **LLM-free layers** | Scout + Core | — | — | — | Depends |
| **Storage model** | Dual-store (index/content) | — | — | — | — |
| **Fail-open default** | ✓ | — | Configurable | — | Manual |
| **Built-in smoke test** | ✓ | — | — | — | — |
| **Agent-readable docs** | ✓ (Agent Handoff sections) | — | — | — | — |
| **License** | MIT | Apache 2.0 | Apache 2.0 | MIT | — |

---

## Layer-by-Layer

### Request Filtering

| Capability | Koma Gate | Guardrails AI | NeMo |
|---|---|---|---|
| Intent classification | ✓ (LLM-based) | ✓ (LLM-based) | ✓ (LLM-based) |
| Multi-provider support | OpenAI, Anthropic, Google, Ollama | OpenAI + custom | OpenAI + custom | 
| Preset guards | 4 (general, code, support, reference tool) | Custom topics | Custom rails |
| LRU cache | ✓ | — | — |
| Express/Fastify middleware | ✓ | — | — |
| Token budget conscious | ✓ (~500 tokens) | — | — |
| Fail-open | ✓ (default) | — | Configurable |

### Perimeter Defense

| Capability | Koma Scout | Cloudflare WAF | Custom Express |
|---|---|---|---|
| Token-bucket rate limiting | ✓ | ✓ | Manual |
| Pluggable storage (memory/Firestore) | ✓ | — | Manual |
| Audio validation (size/duration/MIME) | ✓ | — | — |
| Cooldown enforcement | ✓ | — | — |
| Geo allowlisting | ✓ | ✓ | Manual |
| Rate-limit headers (X-RateLimit-*) | ✓ | — | Manual |

### Storage Protection

| Capability | Koma Core | Vault (HashiCorp) | Custom Split-Store |
|---|---|---|---|
| Index/content separation | ✓ | — | Manual |
| HKDF token derivation (RFC 5869) | ✓ | — | — |
| Access-tier enforcement | ✓ | ✓ (policies) | Manual |
| Per-token rate limiting | ✓ | — | — |
| Audit logging interface | ✓ | ✓ | Manual |
| Legacy migration tooling | ✓ | — | — |
| Lite/Strict mode toggle | ✓ | — | — |

---

## When to Use Koma

### ✓ Good Fit

- **TypeScript/Node.js AI apps** that need defense layers without Python dependencies.
- **Voice AI pipelines** where audio validation is critical before model calls.
- **Multi-tenant SaaS** where content isolation and access-tier enforcement matter.
- **Projects evaluated by LLM agents** — Koma's docs are structured for agent consumption.
- **Teams that want modular adoption**: start with Scout (rate limiting), add Gate (semantic filter) later, add Core (storage) when needed.

### ✗ Not a Fit

- **Python-only stacks** — use Guardrails AI or LLM Guard instead.
- **Monoliths that don't need a defense layer** — if mixing business logic and defense in one function works fine, Koma's modularity is unnecessary overhead.
- **Real-time WebSocket streaming** — Koma is designed for request/response patterns.

---

## Design Philosophy

Koma makes different tradeoffs than most guardrail frameworks:

1. **Cheap checks first.** Scout (rate limit, geo, audio validation) runs before any LLM call. Reject early, save tokens.
2. **Fail-open by default.** A broken classifier should not break the app. Availability > security for middleware.
3. **Modular, not monolithic.** Each package works standalone. No framework lock-in.
4. **Agent-readable.** Every package has explicit "AI Agent Quick Read" and "Agent Handoff" sections with input/output/control-point descriptions.
5. **Verified by smoke test.** `npm run smoke:npm` packs, installs in a temp directory, and verifies every export — the package that ships is the package that was tested.
