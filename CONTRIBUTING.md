# Contributing to Koma

## Getting Started

```bash
git clone https://github.com/swnotmetal/Project-Koma
cd Project-Koma
npm install
npm run build
npm run typecheck
npm run smoke:npm
```

## What to Work On

- **Good first issues** — tagged on GitHub. Start here.
- **Examples** — add a real-world integration in `examples/`. Show how Koma plugs into
  a framework (Express, Fastify, Hono, etc.) or a stack (Next.js API routes, Firebase Functions).
- **Docs** — translations, clarifications, fixing broken links.
- **Tests** — increase coverage on edge cases (silent audio, prompt injection variants).

## Pull Request Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run smoke:npm` passes
- [ ] If adding new exports: update the package README tables
- [ ] If changing docs: sync English and Chinese versions

## Code Style

- English-first source.
- TypeScript strict mode.
- No `any` in public API signatures.
- Preserve each package's documented failure behavior. Miko follows the Agent
  Spec mode; an enforce-mode missing-evidence check denies the action.
- Follow the package-specific [release policy](VERSIONING.md); versions are independent.

## Security

If you find a vulnerability, do NOT open a public issue.
See [SECURITY.md](SECURITY.md).
