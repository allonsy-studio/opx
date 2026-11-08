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
| `init` | Write a starter `.changeset/config.json` and stop. `--changelog` opts in to the [custom changelog format](../../plugins/release/#changelog-format) |
| `add` | Record a change (see below) |
| `version` | Apply pending changes: bump versions and update changelogs. `--snapshot <name>` makes a [snapshot](../../plugins/release/#snapshot-releases) version |
| `publish` | Publish packages whose versions aren't on the registry. `--tag <name>` publishes under a dist-tag; `--no-git-tag` skips git tags |
| `pre enter <tag>` / `pre exit` | Start or end a [pre-release](../../plugins/release/#pre-releases) |

Any other subcommand is passed to the bundled changesets CLI.

## Recording a change

In a terminal, `opx release add` runs changesets' own prompt (`changeset add`), so its options, such as `--open` and `--since`, work as the [changesets docs](https://github.com/changesets/changesets/blob/main/packages/cli/README.md#add) describe.

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

## Opting in to the custom changelog

| Flag | Description |
| --- | --- |
| `--changelog` | Set `changelog` to `@allons-y/opx-release/changelog`, with `repo` from `package.json` |
| `--date` | Also set `releaseDate`, so `version` dates each new version |
| `--maintainer` | GitHub handle that is never thanked. Repeat or comma-separate. Replaces the default, which reads `author` and `contributors` from `package.json`. |

```sh
opx release init --changelog
```

`opx release` requires `release` to be enabled: `opx enable release`.
