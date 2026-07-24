# Koma

Production-grade defensive primitives for AI apps.

<p align="center">
  <img src="logo/lognobg.png" alt="Koma logo" width="160" />
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.x-3178c6?style=flat-square" />
  <img alt="Workspace" src="https://img.shields.io/badge/workspace-monorepo-111827?style=flat-square" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">中文导览</a>
</p>

Koma is a modular defensive toolkit for AI apps. Each skill can be adopted on its own, so you can start small and add protection only where you need it.

## At a Glance

<table>
  <tr>
    <td width="33%">
      <strong>1. Koma Gate</strong><br />
      Semantic request filtering and scope control.<br />
      <code>koma-gate</code>
    </td>
    <td width="33%">
      <strong>2. Koma Scout</strong><br />
      Traffic gating, upload checks, and anti-bot throttling.<br />
      <code>koma-scout</code>
    </td>
    <td width="33%">
      <strong>3. Koma Core</strong><br />
      Zero-trust index/content separation for protected data.<br />
      <code>koma-core</code>
    </td>
  </tr>
</table>

The storage layer inside `koma-core` ships with two operating modes:

<table>
  <tr>
    <td width="50%">
      <strong>Core Lite</strong><br />
      Minimal split-store pattern for beginners.
    </td>
    <td width="50%">
      <strong>Core Strict</strong><br />
      Hardened split-store pattern with tiers, audit, and token-limited retrieval.
    </td>
  </tr>
</table>

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

## Verifying npm Locally

If you want to test the package in a clean directory before or after publishing, use the repo's smoke test:

```bash
npm run smoke:npm
```

Or do it manually with a fresh folder:

```bash
npm pack packages/koma-gate
mkdir C:\temp\koma-test
cd C:\temp\koma-test
npm init -y
npm install D:\path\to\koma-gate-0.1.0.tgz
node --input-type=module -e "import { createGeneralKnowledgeGuard } from 'koma-gate'; console.log(typeof createGeneralKnowledgeGuard)"
```

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
