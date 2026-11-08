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
opx release pre enter beta  # start a pre-release (see below)
```

The first `opx release` command creates `.changeset/config.json` and a short `.changeset/README.md` if you don't have them. The config is the package's [`config.json`](./config.json) with your default branch as `baseBranch`; after that, edit it only to `ignore` private packages. Any other subcommand, such as `pre` or `tag`, is forwarded to the bundled changesets CLI.

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

## Scripts

Add these to the root `package.json` so contributors and CI run the same commands:

```json
{
  "scripts": {
    "changeset": "opx release add",
    "version": "opx release version && yarn install --mode update-lockfile",
    "release": "yarn build && opx release publish"
  }
}
```

`yarn version` is Yarn's own command and ignores a script with that name, so run the script as `yarn run version`. The `yarn install` step refreshes the lockfile after the version bump, so an immutable install still passes in CI.

## Publishing a Yarn workspace

Changesets publishes with plain `npm publish`, so `workspace:` dependency ranges would be published as they are and break installs. Use real semver ranges for dependencies between your own packages. Yarn still links the local workspace, and changesets rewrites the ranges when it bumps versions.

## Pre-releases

Pre-release mode publishes every version with a tag such as `1.2.0-beta.0`, under the matching npm dist-tag, so `npm install` keeps getting the last stable version:

```sh
opx release pre enter beta   # start; writes .changeset/pre.json
opx release version          # 1.2.0-beta.0, then -beta.1, …
opx release publish          # publishes under the `beta` dist-tag
opx release pre exit         # the next `version` is the stable 1.2.0
```

Commit `.changeset/pre.json`. In pre mode, changeset files stay in `.changeset/` until you exit, so the stable release's changelog still lists every change. Run `pre exit` in its own pull request, and the release pull request after it publishes the stable version.

## Snapshot releases

A snapshot publishes the current changesets as a throwaway version, for testing a branch before it merges:

```sh
opx release version --snapshot canary          # 0.0.0-canary-20261108120000
opx release publish --tag canary --no-git-tag  # never under `latest`, no git tags
```

Run snapshots on a branch or in CI, and don't commit the version bump. Set `"snapshot": { "useCalculatedVersion": true }` in `.changeset/config.json` to get `1.2.1-canary-…` instead of `0.0.0-canary-…`. Changesets refuses a snapshot while the repository is in pre-release mode.

## Continuous delivery

[`changesets/action`](https://github.com/changesets/action) opens a release pull request when changesets land on `main`, and publishes when that pull request merges:

```yaml
name: Release
on:
  push:
    branches: [main]
concurrency: ${{ github.workflow }}-${{ github.ref }}
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # version commits and tags
      pull-requests: write  # the release pull request
      id-token: write       # npm trusted publishing
    steps:
      - uses: actions/checkout@v6
      - run: corepack enable
      - uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: yarn
      - run: yarn install --immutable
      - uses: changesets/action@v1
        with:
          version: yarn run version
          publish: yarn release
          commitMode: github-api
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The workflow's token must be allowed to create pull requests (Settings → Actions → General). Or use a GitHub App token, so CI runs on the release pull request; this repository's [release workflow](https://github.com/allonsy-studio/opx/blob/main/.github/workflows/release.yml) does that.

### Authenticating to npm

Use **trusted publishing** (OIDC). There is no token to store or rotate, and npm adds provenance to every version:

1. On npmjs.com, open each package's settings and add a trusted publisher: this repository and the workflow file name (`release.yml`).
2. Give the job `id-token: write`, as above.
3. Use npm 11.5.1 or later. Check with `npm --version`; if it's older, add `npm install --global npm@latest` before the release step.
4. Don't set `NPM_TOKEN`.

npm can only add a trusted publisher to a package that exists, so a package's first version needs a token. Publish it once with an `NPM_TOKEN` secret, then add the trusted publisher and remove the secret.

With a token instead, add `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` to the action's `env`.

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
