# Changelog

All notable changes to Koma will be documented in this file.

## [0.2.0] - 2026-08-08

### Added

- Benchmark suite (`benchmarks/gate-eval.js`) with multi-provider support (OpenAI, Anthropic, Google, DeepSeek, Ollama).
- Public corpus evaluation against [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections) (263 attacks).
- Domain-aligned positive corpus (`benchmarks/data/knowledge-positive.jsonl`) for precision measurement.
- HuggingFace dataset downloader (`benchmarks/fetch-hf-dataset.py`) via Datasets Server API.
- `BENCHMARKS.md` with methodology, results, and reproduction instructions.
- `--provider`, `--positive`, `--corpus`, `--max`, `--preset` CLI flags for eval runner.

### Changed

- Default Gemini model: `gemini-2.0-flash-lite` → `gemini-2.5-flash` (deprecated model removed).
- Google adapter: `maxOutputTokens` increased to 1024 to accommodate thinking-model overhead.
- Root `package.json`: added `"type": "module"` for ESM resolution outside workspace packages.

### Fixed

- All LLM adapters now throw on non-2xx API responses via shared `checkApiResponse()` (previously silent fallback to blocked).
- JSON parsing unified across adapters via shared `parseJsonResponse()` with ```json fence stripping.
- `{domain_name}` placeholder now uses `replaceAll` (was only replacing first occurrence).

### Benchmarks

| Provider | Model | Recall | Precision | FPR |
|----------|-------|:------:|:---------:|:---:|
| DeepSeek | deepseek-chat | 92.8% | 100.0% | 0.0% |
| Google | gemini-2.5-flash | 96.2% | 100.0% | 0.0% |

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