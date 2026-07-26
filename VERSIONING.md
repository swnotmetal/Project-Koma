# Versioning Policy

Koma follows semantic versioning for release management.

## Version Format

Use `MAJOR.MINOR.PATCH` and git tags in the form `vMAJOR.MINOR.PATCH`.

## Release Rules

- `PATCH`: bug fixes, doc fixes, and non-breaking maintenance changes.
- `MINOR`: backward-compatible feature additions.
- `MAJOR`: breaking API changes or package structure changes that require user action.

## Repository Policy

- Keep the root `package.json` version aligned with the latest released workspace state.
- Keep the three package versions aligned unless one package is intentionally released independently later.
- Update the relevant README files when exported names or import paths change.

## Release Flow

### 1. Decide the bump

```
npm run release:patch   # 0.1.0 → 0.1.1  (bug fixes, docs)
npm run release:minor   # 0.1.0 → 0.2.0  (new features, backward-compatible)
npm run release:major   # 0.1.0 → 1.0.0  (breaking changes)
```

This updates all three package versions and the root version in lockstep.

### 2. Update the changelog

Add entries to [CHANGELOG.md](CHANGELOG.md) under the new version heading.

### 3. Verify

```bash
npm run typecheck
npm run build
npm run smoke:npm
```

### 4. Commit and tag

```bash
git add -A
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

### 5. Publish to npm

The tag push triggers [Publish to npm](.github/workflows/publish.yml) via GitHub Actions.
Or publish manually:

```bash
cd packages/koma-gate  && npm publish --access public
cd packages/koma-scout && npm publish --access public
cd packages/koma-core  && npm publish --access public
```

### Quick-reference cheat sheet

| What changed | Command | Tag |
|---|---|---|
| Docs, bug fixes | `release:patch` | `v0.1.1` |
| New feature | `release:minor` | `v0.2.0` |
| Break old API | `release:major` | `v1.0.0` |

## Language Policy

- `README.md` is the default English entry.
- `README.zh-CN.md` is the Chinese entry.
- If both are updated, keep the structure and headings aligned.