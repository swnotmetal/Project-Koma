# Security Hardening — August 2026

This document tracks known security limitations, their status, and the rationale behind design decisions. It exists because a security project that hides its weaknesses is more dangerous than one that lists them openly.

## P0 — Fixed

| # | Issue | Fix | Commit |
|---|-------|-----|--------|
| 1 | `getPreview()` bypassed authorization entirely — no userTier, no rate limit | Added access-tier enforcement; preview is now gated the same as full content | — |
| 2 | `search()` returned `contentToken` in public results, contradicting the "token never exposed" security architecture | `contentToken` now excluded by default; gated behind explicit `includeTokens: true` opt-in | — |
| 3 | All components defaulted to `failOpen: true` — a security component should default to secure | Changed to `failOpen: false` across gate, scout, and all presets. Users who need availability-over-security can opt in explicitly | — |

## P1 — Fixed

| # | Issue | Fix | Commit |
|---|-------|-----|--------|
| 4 | `validateAudioFile()` called `fs.stat()` but never read the file — passed empty string to the validator | Now reads the actual file buffer before base64 validation | — |
| 5 | Rate limiter `incrementAndCheck()` had TOCTOU race — concurrent requests could all pass under limit | Added per-key mutual exclusion lock in `MemoryRateLimitStorage` | — |
| 6 | Token derivation used manual HMAC instead of standard HKDF; no user-binding support | Switched to `crypto.hkdfSync` (RFC 5869); added optional `userId` parameter for user-scoped tokens | — |
| 7 | Unicode homoglyph bypass possible — only zero-width chars were stripped | Added `.normalize('NFKC')` to `sanitizeInput()` | — |
| 8 | `{domain_name}` replaced only first occurrence in prompt template | Changed to `replaceAll` (regex with `g` flag) | — |

## P1 — Acknowledged (Architecture / Design Choice)

| # | Issue | Why not "fixed" |
|---|-------|----------------|
| A | Gate is an LLM judge, not true instruction isolation — policy and user input share a message | Inherent to the scope-classifier architecture. Documented in [Security Boundary](https://github.com/swnotmetal/Project-Koma/blob/main/packages/koma-gate/README.md#security-boundary). Mitigation: use providers with system/user message separation |
| B | Benchmark corpus (263 attacks, 50 safe) is too small for production confidence | Acknowledged. 96.2% is a dataset score, not a security guarantee. Expanding corpus is tracked in [Future Work](https://github.com/swnotmetal/Project-Koma/blob/main/BENCHMARKS.md#future-work) |
| C | Audio duration is estimated from file size (88KB/s heuristic), not parsed from container metadata | By design for zero-dependency. Renamed in docs from "duration validation" to "size-based heuristic." For production, use a dedicated audio processing pipeline |
| D | Geo allowlist falls open when ipinfo is unreachable | Documented. For compliance use cases, set `failOpen: false` explicitly |
| E | Geo trusts `req.ip` without enforcing trusted-proxy configuration | Documented. Users must configure Express `trust proxy` for accurate client IP behind reverse proxies |
| F | Firestore rate-limit key truncated to 128 chars — long keys may collide | Acknowledged. Low-severity for typical key lengths. Hash-based key storage recommended for production |
| G | Cache key only includes `hash(input)`, not policy/model version — stale decisions survive TTL | Documented. For production with frequent policy updates, disable cache or use short TTL |
| H | Core dual-store writes are not transactionally atomic — orphaned content possible on partial failure | Rollback is best-effort. For production RAG infrastructure, use a transactional backend |
| I | `fetchContent()` rate-limits before authorization — probing attacks consume legitimate user quota | By design (rate limiting is abuse prevention, not authorization). Separate abuse-limit from access-quota for production |

## Design Principles (Why These Trade-offs)

Koma is not a production-grade security appliance. It is a set of **AI application security primitives** — reference implementations that demonstrate patterns, not turnkey solutions.

- **Scope over depth**: Each layer solves one problem well, rather than three problems partially
- **Honesty over marketing**: Limitations are documented before features are added
- **Fail-secure by default**: v0.2+ defaults to `failOpen: false`; availability-first mode is opt-in
- **Zero-dependency by design**: Every external dependency is a supply-chain risk. Audio duration uses a heuristic, not a library, by choice

## Contributing

If you find a limitation not listed here, or a way to address an acknowledged issue, open a PR or join the [Security Challenge](https://github.com/swnotmetal/Project-Koma/issues).
