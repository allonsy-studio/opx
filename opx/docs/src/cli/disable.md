---
layout: layouts/docs.njk
title: opx disable
description: Disable a plugin.
eleventyNavigation:
    parent: CLI
    key: opx disable
    order: 4
---

Disable a plugin by short name (`js`, `json`, `md`, `release`) or by package id.

## Synopsis

```sh
opx disable <name> [--task <tasks...>]
```

## Options

| Flag | Default | Description |
| --- | --- | --- |
| `--task <tasks...>` | every task the plugin provides | One or more of `lint`, `build` |

## Behavior

- Plugins are written only to the tasks they provide. `opx disable js` touches `lint` only, because the official JS plugin is a linter.
- `release` is a static task: it sets the top-level `release` boolean and ignores `--task`.
- Unknown names, and `--task` values a plugin doesn't provide, print an error and exit `1`.
- Running it when nothing would change prints a message and exits `0`.

## Examples

```sh
opx disable js
opx disable release
opx disable @acme/opx-plugin-foo --task lint
```
