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

## Suggested Release Flow

1. Update the package versions.
2. Review changelog-worthy changes.
3. Run the project checks.
4. Create a git tag such as `v0.1.0`.
5. Push the branch and tags to the GitHub repository.

## Language Policy

- `README.md` is the default English entry.
- `README.zh-CN.md` is the Chinese entry.
- If both are updated, keep the structure and headings aligned.