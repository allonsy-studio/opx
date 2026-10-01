# @allons-y/opx-release

opx release plugin. Wraps [changesets](https://github.com/changesets/changesets) behind `opx release`, with a starter config on first use and a prompt-free path for CI.

## Install

Install via `opx init` (recommended), or manually:

```sh
yarn add --dev @allons-y/opx-release
opx enable release
```

`opx enable release` sets `"release": true` in `.opx/config.json`. Requires [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli).

## Usage

```sh
opx release add        # record a change
opx release version    # bump versions and write changelogs
opx release publish    # publish packages that aren't on the registry yet
opx release status     # show pending changes (also the default with no subcommand)
opx release init       # write a starter .changeset/config.json and stop
```

The first `opx release` command creates `.changeset/config.json` and a short `.changeset/README.md` if you don't have them. Any other subcommand is forwarded to the bundled changesets CLI.

### Recording a change

Interactively, `opx release add` asks which packages changed, the bump for them, and a summary.

For scripts and CI, pass flags; giving any flag skips the prompts. Without flags, `opx release add` needs an interactive terminal and exits `1` when `CI` or `OPX_NONINTERACTIVE` is set or stdout isn't a TTY:

| Flag | Description |
|---|---|
| `--type`, `-t` | `patch`, `minor`, or `major` |
| `--pkg`, `-p` | Package name. Repeat the flag or comma-separate names. |
| `--summary`, `-m` | Summary for the changelog |
| `--empty` | Record an empty changeset |

```sh
opx release add --type patch --pkg @acme/cli --summary "Fix crash on empty config"
```

## Publishing a Yarn workspace

Changesets publishes with plain `npm publish`, so `workspace:` dependency ranges would be published as they are and break installs. Use real semver ranges for dependencies between your own packages. Yarn still links the local workspace, and changesets rewrites the ranges when it bumps versions.

After `opx release version`, refresh the lockfile so an immutable install passes in CI:

```json
{
  "scripts": {
    "version-packages": "opx release version && yarn install --mode update-lockfile",
    "release": "opx release publish"
  }
}
```

## Continuous delivery

Use [`changesets/action`](https://github.com/changesets/action) with `version: yarn version-packages` and `publish: yarn release`. Provide `GITHUB_TOKEN`, and `NPM_TOKEN` to publish. The workflow's token must be allowed to create pull requests (Settings → Actions → General).

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
