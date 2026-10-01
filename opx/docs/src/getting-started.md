---
layout: layouts/docs.njk
title: Getting started
description: Install opx, let it scan your repo, and run your first lint.
eleventyNavigation:
    key: Getting started
    order: 1
---

## Requirements

- Node.js 24 or newer
- A git repository (opx scans the committed tree)

## Install

opx is currently published under the `beta` tag.

```sh
yarn add --dev @allons-y/opx-cli@beta
# or
npm install --save-dev @allons-y/opx-cli@beta
```

The CLI is deliberately small. Plugins are separate packages that you install yourself, or let `opx init` install for you.

## Set up

```sh
yarn opx init
```

`opx init` looks at the file types in your committed tree and, for each matching plugin, asks whether to enable it now, never, or later. It then:

1. Writes your choices to `.opx/config.json`.
2. Offers to install the plugin packages with your package manager.
3. Scaffolds a root `eslint.config.js` (only if you don't already have one) so your editor matches `opx lint`.
4. Offers to add a `"lint": "opx lint"` script.
5. Installs a post-commit git hook that nudges you when a commit introduces new file types.

Prefer to skip the prompts? Install a plugin and enable it by hand:

```sh
yarn add --dev @allons-y/opx-lint-js
yarn opx enable js
```

## Run it

```sh
yarn opx lint          # lint everything that's enabled
yarn opx lint --fix    # auto-fix where the tool supports it
yarn opx lint src      # lint specific paths
```

Each enabled plugin runs as its own pass, in parallel, with grouped output. The command exits `1` if any plugin reports errors.

## Commit the config, ignore the rest

`.opx/config.json` describes your setup and belongs in version control. `.opx/state.json` and `.opx/cache/` are local. Ignore everything else in the directory:

```gitignore
.opx/*
!.opx/config.json
```

## Next steps

- [How opx works](../concepts/how-it-works/)
- [CLI reference](../cli/)
- [Configuration reference](../reference/config/)
- [Compose your ESLint config](../guides/compose-eslint/)
