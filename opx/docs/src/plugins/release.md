---
layout: layouts/docs.njk
title: release
description: A changesets-based release flow.
eleventyNavigation:
    parent: Plugins
    key: release
    order: 5
---

`@allons-y/opx-release` wraps [changesets](https://github.com/changesets/changesets) behind `opx release`. It writes a sensible default changesets config on first use and gives you a prompt-free path for CI.

## Install

```sh
yarn add --dev @allons-y/opx-release
yarn opx enable release
```

`opx enable release` sets `"release": true` in `.opx/config.json`.

## The flow

```sh
yarn opx release add          # record a change (interactive, or pass flags)
yarn opx release version      # bump versions and write changelogs
yarn opx release publish      # publish, tag, push, and create GitHub releases
yarn opx release status       # see what would be released
```

The first `opx release` command creates `.changeset/config.json` and a short README if you don't have them. The config is the plugin's starter `config.json` with your default branch as `baseBranch`; after that, edit it only to `ignore` private packages or to opt in to the [custom changelog](#changelog-format). Every subcommand is described in the [`opx release` reference](../../cli/release/).

## Changelog format

The starter config uses `@changesets/cli/changelog`. To opt in to a more readable format, which reads cleanly as plain text and in print and renders cleanly as Markdown, run:

```sh
yarn opx release init --changelog
```

This sets `changelog` in `.changeset/config.json` and leaves every other field alone. It reads `repo` from the `repository` field in your root `package.json`. Or set it by hand:

```json
{
  "changelog": ["@allons-y/opx-release/changelog", { "repo": "acme/widgets" }]
}
```

Each entry reads like a sentence, with the PR (or commit) link and any thanks after it. 📝 marks the link:

```md
- Fix crash on empty config. (📝 [#12](https://github.com/acme/widgets/pull/12)) — thanks [@alice](https://github.com/alice)!
```

| Option | Description |
|---|---|
| `repo` | `owner/repo` the links point at. Defaults to `GITHUB_REPOSITORY`. |
| `maintainers` | Handles that are never thanked (case-insensitive). Everyone else is, except bots such as Renovate and Dependabot. Defaults to the `author` and `contributors` in your workspace root's `package.json`. |
| `disableThanks` | `true` drops the thanks for everyone. |
| `releaseDate` | `true` adds a `📅 _Released 8 November 2026_` line under each new version heading. `init --date` sets it. |

Maintainers come from GitHub noreply emails (`1234+octocat@users.noreply.github.com`) or `https://github.com/octocat` URLs in `author` and `contributors`. A person with neither is skipped. To list them yourself, pass `--maintainer <handle>` to `init` or set `maintainers`; an explicit list replaces the default.

A changeset summary can override what the lookup finds, one per line: `pr: 123`, `commit: a1b2c3d`, `author: @octocat`. These lines are never read from inside fenced code, so a YAML example with `user: node` stays as written. Bare `#123` references become links; references in inline code, links, and URLs don't.

### Writing a changeset

The first line becomes the entry. If it's missing, or starts a code block, the entry reads _No summary._ and `opx release version` warns. Everything after it stays inside the entry, so paragraphs, lists, and fenced code blocks render as part of that change. References like `#123` inside code are left alone. Emoji are kept as written.

For a breaking change, end the summary with a `migration:` line (or `upgrade:`). The rest of the summary becomes a **To upgrade:** paragraph under the entry:

````md
---
"@acme/widgets": major
---

✨ Rename the `run` option to `exec`. Closes #4.

```js
widgets({ exec: true });
```

migration: Replace `run` with `exec` in your config.
````

renders as:

````md
## 2.0.0

📅 _Released 8 November 2026_

### Major Changes

- ✨ Rename the `run` option to `exec`. Closes [#4](https://github.com/acme/widgets/issues/4). (📝 [#7](https://github.com/acme/widgets/pull/7))

  ```js
  widgets({ exec: true });
  ```

  **To upgrade:** Replace `run` with `exec` in your config.
````

A dependency bump shows the old and new versions, with a link to the diff between their tags:

```md
- Updated `@acme/core` 1.0.0 → 2.0.0 ([diff](https://github.com/acme/widgets/compare/@acme/core@1.0.0...@acme/core@2.0.0))
```

Several dependencies share one bullet, one per line under it. Private packages have no tags, so they get no diff link. The link also 404s until both tags exist, for example before a package's first tagged release.

### Release dates

Changesets never dates a version. With `releaseDate: true`, `opx release version` adds a line such as `📅 _Released 8 November 2026_` under each version it just wrote. The date is in UTC, with the month spelled out, so it reads the same in every locale. It doesn't date older versions or snapshot releases. With `"commit": true`, changesets commits the version bump first, and opx adds the dates to that same commit. The date goes on its own line, not in the heading, because `changesets/action` finds a version's notes by matching the heading text exactly.

The date is the day `opx release version` runs. In CI, that's when the release pull request was last updated, which is usually the day it merges.

The generator calls the GitHub API, so `opx release version` needs `GITHUB_TOKEN`. In CI, `changesets/action` provides it. Locally, put it in `.env`. You don't need `@changesets/changelog-github`; the plugin ships its own lookup.

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

## Publishing a monorepo

Changesets 2 publishes with plain `npm publish`, so `workspace:` dependency ranges would be published as they are and break installs ([changesets#432](https://github.com/changesets/changesets/issues/432)). Use real semver ranges for dependencies between your own packages. Yarn still links the local workspace, and changesets rewrites the ranges when it bumps versions.

The fix is planned for Changesets 3, which publishes through the repository's own package manager. opx still bundles Changesets 2; when it moves to 3, this advice changes.

## Pre-releases

Pre-release mode publishes every version with a tag such as `1.2.0-beta.0`, under the matching npm dist-tag, so `npm install` keeps getting the last stable version:

```sh
yarn opx release pre enter beta   # start; writes .changeset/pre.json
yarn opx release version     # 1.2.0-beta.0, then -beta.1, …
yarn opx release publish     # publishes under the `beta` dist-tag
yarn opx release pre exit         # the next `version` is the stable 1.2.0
```

Commit `.changeset/pre.json`. In pre mode, changeset files stay in `.changeset/` until you exit, so the stable release's changelog still lists every change. Run `pre exit` in its own pull request, and the release pull request after it publishes the stable version.

## Snapshot releases

A snapshot publishes the current changesets as a throwaway version, for testing a branch before it merges:

```sh
yarn opx release version --snapshot canary          # 0.0.0-canary-20261108120000
yarn opx release publish --tag canary --no-git-tag  # never under `latest`, no git tags
```

Run snapshots on a branch or in CI, and don't commit the version bump. Set `"snapshot": { "useCalculatedVersion": true }` in `.changeset/config.json` to get `1.2.1-canary-…` instead of `0.0.0-canary-…`. Changesets refuses a snapshot while the repository is in pre-release mode.

## Releasing

`opx release publish` runs the whole release, and is safe to run again if a step fails:

1. **Publish** every package version that isn't on the registry yet, with changesets.
2. **Tag** each version that has no tag: `v1.2.3` for a single package, `name@1.2.3` in a monorepo, as changesets names them.
3. **Push** the tags `origin` doesn't have.
4. **Create a GitHub release** for each tag that has none, with that version's changelog notes. Versions with a prerelease tag, such as `2.0.0-beta.1`, become GitHub prereleases.

Each step skips what's already done, so after a failure, run it again and it finishes the rest. A run ends with a summary:

```text
  opx release · publish

  ● Publishing with changesets
  ✔ Published to the registry
  ✔ Tagged 2 versions  @acme/cli@1.3.0, @acme/core@1.3.0
  ✔ Pushed 2 tags to origin  @acme/cli@1.3.0, @acme/core@1.3.0
  ✔ Created 2 GitHub releases

  Package      Version   Tag     GitHub release
  @acme/cli    1.3.0     ✔ new   ✔ https://github.com/acme/tools/releases/tag/…
  @acme/core   1.3.0     ✔ new   ✔ https://github.com/acme/tools/releases/tag/…
```

GitHub releases need `GITHUB_TOKEN` with `contents: write`, and the repository from `GITHUB_REPOSITORY` or the `repository` field in `package.json`. Without a token, opx says so and skips that step.

The first run in a repository tags each package's current version at the current commit, as `changeset tag` does, and creates releases for those tags.

### Settings

Every step is on by default. Turn steps off in `.opx/config.json`, where `release` takes settings instead of `true`:

```json
{
  "release": { "githubReleases": false }
}
```

| Setting | Flag | Default | What it does |
|---|---|---|---|
| `push` | `--no-push` | `true` | Push new tags to `origin`. Without it, no GitHub release is made, because a release needs its tag on GitHub. |
| `githubReleases` | `--no-github-release` | `true` | Create a GitHub release for each new tag. |
| `action` | `--action`, `--no-action` | on when `action.yml` exists | Release a GitHub Action (below). |

A flag wins over the setting for that run. Changesets' own publish flags, such as `--tag`, `--otp`, and `--no-git-tag`, pass through; `--no-git-tag` publishes and stops.

### GitHub Actions

A repository with an `action.yml` (or `action.yaml`) at its root is released as a GitHub Action, so `uses: owner/repo@v1` gets a build that runs:

1. opx commits the build output (`dist/` by default) onto a release-only commit whose parent is the current commit. It doesn't touch your branch, working tree, or staged files, and the build can stay in `.gitignore`.
2. The version tag, such as `v1.4.0`, points at that commit.
3. The major tag, such as `v1`, moves to it too, except for prereleases.

Build before publishing; the `release` script under [Scripts](#scripts) does. Other build folders, or keeping the major tag still, are settings:

```json
{
  "release": { "action": { "dist": "build", "majorTag": false } }
}
```

An Action repository has one package. When git has no identity, as in a fresh CI checkout, the release commit is made as `github-actions[bot]`.

## Continuous delivery

[`changesets/action`](https://github.com/changesets/action) opens a release pull request when changesets land on `main`. When that pull request merges, it runs `yarn release`, and `opx release publish` does the rest. Set `createGithubReleases: false`: opx creates the releases, and the action would otherwise try to create them a second time and fail.

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
          title: "chore(release): version packages"
          commit: "chore(release): version packages"
          commitMode: github-api
          createGithubReleases: false  # opx release publish makes them
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`title` and `commit` give the release pull request and its commit a Conventional Commits message instead of the action's default, "Version Packages". The workflow's token must be allowed to create pull requests (Settings → Actions → General). Or use a GitHub App token, so CI runs on the release pull request; this repository's [release workflow](https://github.com/allonsy-studio/opx/blob/main/.github/workflows/release.yml) does that.

### Authenticating to npm

Use **trusted publishing** (OIDC). There is no token to store or rotate, and npm adds a provenance attestation to each version when the repository and the package are both public:

1. On npmjs.com, open each package's settings and add a trusted publisher: this repository and the workflow file name (`release.yml`).
2. Give the job `id-token: write`, as above.
3. Use npm 11.5.1 or later. Check with `npm --version`; if it's older, add `npm install --global npm@latest` before the release step.
4. Don't set `NPM_TOKEN`.

npm can only add a trusted publisher to a package that exists, so a package's first version needs a token. Publish it once with an `NPM_TOKEN` secret, then add the trusted publisher and remove the secret.

With a token instead, add `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` to the action's `env`.
