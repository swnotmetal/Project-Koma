# Koma

Production-grade defensive primitives for AI apps.

![Koma logo](logo/lognobg.png)

中文导览: [README.zh-CN.md](README.zh-CN.md)

Koma is split into three independent skills so each part can be adopted on its own:

1. `koma-gate` - semantic request filtering and scope control
2. `koma-scout` - traffic gating, upload checks, and anti-bot throttling
3. `koma-core` - zero-trust index/content separation for protected data

The storage layer ships with two operating modes inside `koma-core`:

- **Core Lite** - minimal split-store pattern for beginners
- **Core Strict** - hardened split-store pattern with tiers, audit, and token-limited retrieval

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

## Why This Structure Works

- Each skill is useful on its own.
- Beginners can start with one layer and add the rest later.
- The storage piece is intentionally split into a simple mode and a strict mode.
- The repository reads like a product, not a notebook dump.

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
- To switch to Chinese, open [README.zh-CN.md](README.zh-CN.md).
- Release and tag rules live in [VERSIONING.md](VERSIONING.md).

## Contributing

Contributions should stay:

- English-first in source
- concise and professional in docs
- modular and beginner-friendly
- focused on defensive use cases

## License

Koma is released under the MIT License. See [LICENSE](LICENSE).
