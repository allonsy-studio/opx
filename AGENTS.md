# opx: agent instructions

## Decisions

### The `version` script name

The root `version` script follows the org standards and runs as `yarn run version`. Plain `yarn version` is Yarn's own command, and `npm version` runs any script named `version` during its own bump.

We kept `version` for now. If the overlap causes trouble, rename the script to `version-packages`, the name the changesets docs use. Update the org standards, the root `package.json`, `.github/workflows/release.yml`, and the release docs in `opx/release/README.md` and `opx/docs/src/plugins/release.md` together.

### Changesets 2 and `workspace:` ranges

opx bundles `@changesets/cli` 2, which publishes with plain `npm publish` and leaves `workspace:` ranges as written ([changesets#432](https://github.com/changesets/changesets/issues/432)). The release docs tell users to use real semver ranges between their own packages because of it. When opx moves to Changesets 3, check whether the fix landed, then update the "Publishing a monorepo" sections in `opx/release/README.md` and `opx/docs/src/plugins/release.md`.
