---
layout: layouts/docs.njk
title: opx init
description: Interactively set up opx for this repo.
eleventyNavigation:
    parent: CLI
    key: opx init
    order: 1
---

Scan the committed tree and interactively wire up opx.

## Synopsis

```sh
opx init [--auto] [--quiet]
```

## Options

| Flag | Default | Description |
| --- | --- | --- |
| `--auto` | `false` | Only proceed in an interactive terminal. Intended for `postinstall` scripts. |
| `--quiet` | `false` | Suppress informational output when `--auto` exits early |

## What it does

1. Creates `.opx/config.json` if there isn't one.
2. For each suggested plugin not yet enabled, asks **Yes**, **No**, or **Later**. "Later" records a deferral in `.opx/state.json` for the current branch.
3. Saves your choices and offers to install any missing packages with the detected package manager (npm, yarn, or pnpm).
4. Scaffolds a root `eslint.config.js` composed from your enabled lint plugins. It never overwrites an existing file.
5. Offers to add `"lint": "opx lint"` to your `package.json` scripts.
6. Installs the `post-commit` husky hook and updates `.gitignore` to ignore `.opx/*` except `.opx/config.json`, which stays tracked.

## Non-interactive use

With no TTY, `CI` set, or `OPX_NONINTERACTIVE` set, `init` prints the suggestions and the commands to run instead of prompting. Use [`opx enable`](../enable/) to apply them.
