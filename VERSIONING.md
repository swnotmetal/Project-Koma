# Versioning and releases

Each published package has its own version. The private root package is not an
npm release and does not need to match a workspace package. Check each
package.json and the registry before choosing a new version.

Use semantic versions for stable packages and explicit prerelease versions for
Miko's alpha. A docs-only repository or logo change does not need an npm release.

## Miko and DSH alpha

1. Update the Miko version, the DSH adapter version, its exact koma-miko dependency,
   and the matching package-lock.json entries together.
2. Update the relevant package README and [changelog](CHANGELOG.md).
3. Build before checking: tests and dependent packages resolve workspace dist files.

    npm run build
    npm run typecheck
    npm test
    npm run smoke:npm

4. Run the fixed Codex recovery fixture for a Miko release, using the installed
   standalone CLI via MIKO_CODEX_BIN. Additional paid host tests depend on the
   affected behavior and available budget. See the
   [host evaluation](docs/evals/miko-host-adapters-alpha.md).
5. Commit, check remote changes, push, and verify CI. Manually dispatch
   [Publish Miko alpha](.github/workflows/publish-miko.yml) on the intended branch.

The workflow publishes only Miko and DSH, in that order. Their postpublish script
synchronizes both alpha and latest to the published version and reads them back.
A failed tag check means the release is incomplete; do not skip lifecycle scripts.
Confirm the exact DSH dependency and both tags independently after publication.

## Other packages

Release only the packages affected. Do not use the root release:* scripts as a
routine Miko bump: they target every workspace package.

The older [Publish to npm workflow](.github/workflows/publish.yml) publishes Gate,
Scout, and Core together on a published GitHub Release or manual dispatch. It is
not triggered by a plain tag push. Use it only when all three versions are ready;
MCP packages are not included. Review independent release changes before publishing.

Keep English and Chinese package documentation aligned when public behavior or
setup changes. Published npm versions are immutable; corrections need a new version.
