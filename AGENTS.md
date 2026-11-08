# Agent notes

## Decisions

### The `version` script name

The root `version` script follows the org standards and runs as `yarn run version`. Plain `yarn version` is Yarn's own command, and `npm version` runs any script named `version` during its own bump.

We kept `version` for now. If the overlap causes trouble, rename the script to `version-packages`, the name the changesets docs use. Update the org standards, the root `package.json`, `.github/workflows/release.yml`, and the release docs in `opx/release/README.md` and `opx/docs/src/plugins/release.md` together.
