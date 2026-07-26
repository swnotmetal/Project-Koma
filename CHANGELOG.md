# Changelog

All notable changes to Koma will be documented in this file.

## [0.1.0] - 2026-07-26

### Added

- Initial Koma workspace structure with three packages: `koma-gate`, `koma-scout`, `koma-core`.
- `koma-gate`: LLM-based intent classification with OpenAI / Anthropic / Google / Ollama adapters, 4 preset guards, LRU cache, Express & Fastify middleware.
- `koma-scout`: token-bucket rate limiting (in-memory + Firestore), audio upload validation (size/duration/MIME/cooldown), geo allowlisting via ipinfo.io.
- `koma-core`: HKDF-based dual-store architecture (index + content), access-tier enforcement, audit logging, rate-limited retrieval, legacy migration tooling.
- `koma-core` Lite/Strict mode toggle via `StorageConfig.mode`.
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
- `koma-scout` `validateAudioFile()` now reads file content correctly during validation.
- ARCHITECTURE_MAP.md field names corrected to camelCase (matching TypeScript types).