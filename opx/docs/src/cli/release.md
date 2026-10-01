---
layout: layouts/docs.njk
title: opx release
description: Drive the changesets-based release flow.
eleventyNavigation:
    parent: CLI
    key: opx release
    order: 7
---

Forward to the release plugin ([`@allons-y/opx-release`](../../plugins/release/)).

## Synopsis

```sh
opx release [subcommand] [args...]
```

| Subcommand | What it does |
| --- | --- |
| *(none)* / `status` | Show pending changes and the versions they'd produce |
| `init` | Write a starter `.changeset/config.json` and stop |
| `add` | Record a change (see below) |
| `version` | Apply pending changes: bump versions and update changelogs |
| `publish` | Publish packages whose versions aren't on the registry |

Any other subcommand is passed to the bundled changesets CLI.

## Recording a change

Interactively, `opx release add` asks which packages changed, the bump, and a summary.

For scripts and CI, pass flags:

| Flag | Description |
| --- | --- |
| `--type`, `-t` | `patch`, `minor`, or `major` |
| `--pkg`, `-p` | Package name. Repeat or comma-separate. |
| `--summary`, `-m` | Summary for the changelog |
| `--empty` | Record an empty changeset |

```sh
opx release add --type patch --pkg @acme/cli --summary "Fix crash on empty config"
```

`opx release` requires `release` to be enabled: `opx enable release`.
