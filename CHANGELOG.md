# Changelog

All notable changes to Koma will be documented in this file.

## Unreleased

### Changed

- Replace the root README logo with the author-supplied artwork.
- Remove retired Gate promotional media, duplicate artwork, unmaintained
  comparison tables, and the old adopter stories. Keep current demos and evals.
- Update the architecture and release guides for the current package boundaries.

## Miko alpha.14 / DSH alpha.13 - 2026-10-13

### Changed

- Add a bilingual scope statement to the root and package READMEs: Miko is an
  extremely lightweight tool, not a security or compliance boundary, and users
  should tell their agent to load the Skills it needs at the start of a
  conversation. Miko is the backstop, not a replacement for instruction.
- Remove the remaining "Copilot adapter work is paused" claims from the package
  READMEs, `llms.txt`, the host-adapter evaluation record, and the roadmap, so
  they no longer contradict the current support table.
- Record the silent-under-enforcement mode in the package README disclaimers: a
  Spec whose tool names match nothing the host reports leaves the ledger full of
  evidence while recording no `contract_activated`, which looks identical to
  "nothing needed checking".
- Pin the DSH adapter to Miko alpha.14.

## Miko alpha.13 / DSH alpha.12 - 2026-10-13

### Changed

- Relay Miko's passive one-line status through the agent on VS Code Copilot. That
  host captures hook output but does not render `systemMessage` in its chat UI, so
  the completion receipt and recovery notice were reaching nobody. The adapter now
  mirrors the deduplicated Codex `PostToolUse` relay via `additionalContext`.
- Record the first verified live VS Code Copilot enforcement cycle in the host
  support table, and state the visibility limit instead of leaving adapter work
  described as paused. The cycle ran on the Local harness (Copilot Chat 0.69.0 /
  VS Code 1.141.0); the ledger holds `contract_activated` and the denial.
- Pin the DSH adapter to Miko alpha.13.

## DSH alpha.11 - 2026-09-28

### Changed

- Widen the DeepSeek Harness peer dependencies to `>=0.1.1-rc.2` so a DSH release
  candidate bump no longer forces a Miko republish. `devDependencies` remain
  pinned for local builds.

## Miko alpha.12 / DSH alpha.10 - 2026-09-23

### Added

- Explain stale Skill evidence after auto-compaction. Compaction advances the
  evidence epoch, so a real pre-compaction Skill read no longer satisfied a
  `reloadAfterCompaction` requirement and was reported only as missing, which
  read like Miko had forgotten the read. The result now states that the evidence
  was observed before compaction and must be repeated. Reason codes and blocking
  behaviour are unchanged.

### Fixed

- Stop an action-scoped Agent Spec from capturing unrelated later reads or
  queries. Preparation and action policy now apply only to the calls matching the
  activating selector, while the Spec stays active for completion checks.
- Accept the PowerShell backtick-continuation and trailing `-Raw` forms of the
  safe read-only Skill reload in the Codex adapter, so preparation recovery can
  complete in that shell.
- Bound host-supplied strings before they reach a regex: Codex and VS Code shell
  Skill reads are capped at 4096 characters (VS Code also rejects `$()`
  substitution), and Core index-ID slugs at 256 characters. Addresses three
  CodeQL polynomial-regex findings.

### Changed

- Pin the DSH adapter to Miko alpha.12.

## Miko alpha.11 / DSH alpha.9 - 2026-09-03

### Changed

- Focus public setup and discovery docs on Claude Code and Codex CLI.
- Add compact completion receipts and a deduplicated Codex status relay;
  no matching Spec reports presence without claiming verification.
- Pin the DSH adapter to Miko alpha.11.

### Fixed

- Make the Windows Codex live fixture use a quote-free Hook command and explicit
  per-invocation trust for its generated project. The fixed recovery case passed.
- Build workspace entry points before running release checks in a clean checkout.
- Make every Miko and DSH alpha publish synchronize both npm `alpha` and
  `latest` tags to the package version, then verify the result against the
  registry. This closes the path that left default installs several patches
  behind the documented alpha.
- Add CI release invariants and a dedicated, serialized Miko publish workflow.

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
