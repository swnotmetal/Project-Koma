# Koma

Production-grade defensive primitives for AI apps.

<p align="center">
  <img src="logo/lognobg.png" alt="Koma logo" width="160" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">中文导览</a>
</p>

Koma is a modular defensive toolkit for AI apps. Each skill can be adopted on its own, so you can start small and add protection only where you need it.

## At a Glance

Koma is split into three independent skills:

1. `koma-gate` - semantic request filtering and scope control
2. `koma-scout` - traffic gating, upload checks, and anti-bot throttling
3. `koma-core` - zero-trust index/content separation for protected data

The storage layer inside `koma-core` ships with two operating modes:

- **Core Lite** - minimal split-store pattern for beginners
- **Core Strict** - hardened split-store pattern with tiers, audit, and token-limited retrieval

## Why It Feels Simple

- One repository, three clear skills.
- Each module has a single job.
- The storage layer is split into a beginner mode and a strict mode.
- The homepage stays readable on GitHub without extra setup.

## Repository Layout

- `packages/koma-gate/README.md`
- `packages/koma-scout/README.md`
- `packages/koma-core/README.md`
- `README.zh-CN.md`
- `VERSIONING.md`
- `CHANGELOG.md`
- `LICENSE`
- `package.json`
- `demo/server.js`
- `packages/` - implementation source for the current codebase

## Quick Start

Run the local demo with stock Node.js:

```bash
node demo/server.js
```

Then try:

- `GET /health`
- `POST /guard`
- `POST /ingest`
- `GET /search?q=example`
- `GET /content?token=...`
- `GET /self-test`

Example guard request:

```bash
curl -X POST http://localhost:8080/guard \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"How do I build rate limiting middleware in Node?\"}"
```

Example self-test:

```bash
curl http://localhost:8080/self-test
```

## Module Notes

### Koma Gate

Returns a strict JSON decision and blocks off-scope traffic before it reaches the model or tools.

### Koma Scout

Handles request throttling, upload validation, and cheap perimeter checks before expensive work begins.

### Koma Core

Separates public search records from private content payloads and links them with backend-derived opaque tokens.

## Development Notes

- Source code is English-first.
- The repo is friendly to vibecoders, but the APIs stay production-oriented.
- The demo server is dependency-free and includes a built-in self-test.
- The three skills are designed to be published independently if you want a broader open-source rollout.
- Release and tag rules live in [VERSIONING.md](VERSIONING.md).

## Bilingual Guide

- English: [README.md](README.md)
- 中文导览: [README.zh-CN.md](README.zh-CN.md)

## Contributing

Contributions should stay:

- English-first in source
- concise and professional in docs
- modular and beginner-friendly
- focused on defensive use cases

## License

Koma is released under the MIT License. See [LICENSE](LICENSE).
