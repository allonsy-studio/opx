---
layout: layouts/docs.njk
title: release
description: A changesets-based release flow.
eleventyNavigation:
    parent: Plugins
    key: release
    order: 4
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
yarn opx release publish      # publish what isn't on the registry yet
yarn opx release status       # see what would be released
```

The first `opx release` command creates `.changeset/config.json` and a short README if you don't have them. Every subcommand is described in the [`opx release` reference](../../cli/release/).

## Publishing a monorepo

Changesets publishes with plain `npm publish`. In a Yarn workspace, `workspace:` dependency ranges in your `package.json` files would be published as they are, which breaks installs. Use real semver ranges for dependencies between your own packages; Yarn still links the local workspace, and changesets rewrites the ranges when it bumps versions.

After `opx release version`, refresh the lockfile so CI's immutable install passes:

```json
{
  "scripts": {
    "version-packages": "opx release version && yarn install --mode update-lockfile"
  }
}
```

## Continuous delivery

With [`changesets/action`](https://github.com/changesets/action), point `version` and `publish` at scripts that call `opx release version` and `opx release publish`. Provide `GITHUB_TOKEN` and, to publish, `NPM_TOKEN`.
