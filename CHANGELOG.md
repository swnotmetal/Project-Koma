# Changelog

All notable changes to Koma will be documented in this file.

## Miko alpha.10 / DSH alpha.8 - 2026-09-02

### Added

- Add a visible Claude CLI handshake for guided policy exceptions: Miko pauses
  the action, asks `Allow once` or `Keep current scope`, and binds an approval
  to the exact tool call with a privacy-safe fingerprint.
- Persist review request, decision, and one-time consumption metadata in the
  local ledger without storing prompts, source code, or tool output.

### Changed

- Keep deterministic preparation recovery automatic; ask the user only when a
  guided Spec encounters a genuine allowlist, risk, or path exception.
- Pin `koma-miko-dsh@0.1.0-alpha.8` to `koma-miko@0.1.0-alpha.10`.

### Verified

- A real Claude CLI 2.1.257 / Haiku 4.5 session visibly completed `Miko pause
  → Allow once → exact edit → Miko verified`; a separate run kept the current
  scope and made no edit.

## Miko alpha.9 / DSH alpha.7 - 2026-09-02

### Added

- Add `guided` enforcement mode: deterministic preparation and completion gaps
  pause for automatic recovery, while genuine policy exceptions ask the user.
- Expose the mode through `miko.json`, the schema, initializer, doctor output,
  bilingual package documentation, and adapter tests.

### Changed

- Default new Claude Code, Gemini CLI, and VS Code setups to `guided`; keep the
  Codex Technical Preview on `enforce` until its review UX improves.
- Pin `koma-miko-dsh@0.1.0-alpha.7` to `koma-miko@0.1.0-alpha.9`.

### Verified

- 193 tests, workspace typechecks, hook conformance, package builds, audit demo,
  DSH no-model preflight, npm pack checks, and fresh registry installs passed.

## [0.1.0-alpha.1] - 2026-08-26

### Fixed

- Publish `koma-miko` and `koma-miko-dsh` public alphas with corrected release metadata.
- `.0` shipped with a stale "not published" README; `.1` corrects it. Verifier and adapter runtime are unchanged.
- Verified `koma-miko-dsh@alpha` registry install in a fresh DSH profile resolves both packages.

## [0.2.0] - 2026-08-08

### Added

- Benchmark suite (`benchmarks/gate-eval.js`) with multi-provider support.
- Public evaluation against the deepset prompt-injection corpus and a domain-aligned benign corpus.
- Reproduction documentation and provider/model selection flags.

### Changed

- Default Gemini model updated to `gemini-2.5-flash` after the previous model was deprecated.
- Google adapter output budget increased for thinking-model overhead.
- Root package configured for ESM resolution.

### Fixed

- Non-2xx model responses now throw instead of silently becoming blocked decisions.
- JSON response parsing is shared across providers and strips fenced JSON.
- All `{domain_name}` placeholders are replaced.

### Benchmarks

| Provider | Model | Recall | Precision | FPR |
|---|---|---:|---:|---:|
| DeepSeek | deepseek-chat | 92.8% | 100.0% | 0.0% |
| Google | gemini-2.5-flash | 96.2% | 100.0% | 0.0% |

## [0.1.0] - 2026-07-26

### Added

- Initial Koma workspace structure with three packages: `koma-gate`, `koma-scout`, `koma-core`.
- `koma-gate`: LLM-based intent classification with OpenAI / Anthropic / Google / Ollama adapters, 4 preset guards, LRU cache, Express & Fastify middleware.
- `koma-scout`: token-bucket rate limiting (in-memory + Firestore), audio upload validation (size/duration/MIME/cooldown), geo allowlisting via ipinfo.io.
- `koma-core`: HKDF-based dual-store architecture (index + content), access-tier enforcement, audit logging, rate-limited retrieval, legacy migration tooling.
- Shared `AccessTier` type (`'public' | 'premium' | 'enterprise'`).
- Self-contained `demo/server.js` with keyword-based Gate simulation.
- Vitest test suite: 72 tests across 3 packages.
- Clean-install smoke test (`npm run smoke:npm`).
- Bilingual documentation (English + 中文).

### Fixed

- HKDF implementation replaced with Node.js `crypto.hkdfSync` (RFC 5869).
- HTTP error handling added to all 4 LLM adapters.
- Duplicate `parseResponse` methods consolidated into shared `parseClassificationResponse()`.
- LLM adapter boilerplate extracted into `BaseLLMAdapter` template-method class.
- `TinyEventEmitter` replaced with Node.js native `EventEmitter`.
- Preset guard factories refactored to data-driven `PRESETS` + `createPresetGuard()`.
- `koma-scout` `validateAudioFile()` fixed to actually read file content.
- ARCHITECTURE_MAP.md field names corrected to camelCase (matching TypeScript types).
