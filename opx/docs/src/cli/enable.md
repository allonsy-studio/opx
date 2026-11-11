---
layout: layouts/docs.njk
title: opx enable
description: Enable a plugin.
eleventyNavigation:
    parent: CLI
    key: opx enable
    order: 3
---

Enable a plugin by short name (`js`, `ts`, `json`, `md`, `release`) or by package id.

## Synopsis

```sh
opx enable <name> [--task <tasks...>]
```

## Options

| Flag | Default | Description |
| --- | --- | --- |
| `--task <tasks...>` | every task the plugin provides | One or more of `lint`, `build`. Required when opx can't load a third-party plugin to read its tasks |

## Behavior

- Plugins are written only to the tasks they provide. `opx enable js` touches `lint` only, because the official JS plugin is a linter.
- A first-party package id resolves to its short name: `opx enable @allons-y/opx-lint-ts` is the same as `opx enable ts`, and writes `ts` under `lint`.
- A third-party package id (`opx-plugin-foo`, `@scope/opx-plugin-foo`) is written under the tasks its detectors declare. opx loads the installed package to read them. If it can't, pass `--task`; opx never writes a plugin to every task.
- `release` is a static task: it sets the top-level `release` boolean and ignores `--task`.
- Unknown names, and `--task` values a plugin doesn't provide, print an error and exit `1`.
- Running it when nothing would change prints a message and exits `0`. A plugin that already points at a config file counts as enabled and keeps its path.
- A newly enabled plugin follows the others in its task: when they all point at the same config file, such as `./eslint.config.js`, it points there too. Otherwise it's set to `true`.
- After enabling a lint plugin, opx prints any import & spread lines your own `eslint.config.js` still needs. It never edits that file.
- Enabling `ts` next to a 0.x `@allons-y/opx-lint-js` prints the command to upgrade it, because 0.x also lints TypeScript. See [Move from lint-js 0.x](../../plugins/lint-ts/#move-from-lint-js-0x).

## Examples

```sh
opx enable js
opx enable ts
opx enable @allons-y/opx-lint-ts
opx enable release
opx enable @acme/opx-plugin-foo --task lint
```
