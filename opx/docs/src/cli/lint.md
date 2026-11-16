---
layout: layouts/docs.njk
title: opx lint
description: Run every enabled linter.
eleventyNavigation:
    parent: CLI
    key: opx lint
    order: 5
---

Run every enabled lint plugin.

## Synopsis

```sh
opx lint [--fix] [paths...]
```

## Options

| Flag    | Description                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--fix` | Apply automatic fixes where the underlying tool supports it. Formatters write their changes; without `--fix` they only check |

## Behavior

- Plugins that format, such as [format](../../plugins/format/), run first, one at a time. The rest then run concurrently. Output is printed as labeled groups, formatters first.
- Every plugin runs even when an earlier one fails, so one run reports everything.
- Paths are forwarded to every plugin. A plugin skips paths it doesn't handle, so `opx lint README.md` only lints that file with the Markdown plugin.
- Files ignored by your `.gitignore` are ignored by the linters as well.
- If no linters are enabled, it prints a hint to run `opx init` and exits `0`.
- If a linter is enabled but can't be loaded (not installed, or its package fails to import), it says why on stderr, runs the linters that did load, and exits `1`.

## Exit codes

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | Clean, or nothing to lint                                                    |
| `1`  | At least one plugin reported errors, or an enabled plugin couldn't be loaded |
