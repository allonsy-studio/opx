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

| Flag | Description |
| --- | --- |
| `--fix` | Apply automatic fixes where the underlying tool supports it |

## Behavior

- Each plugin runs as its own pass, concurrently, and its output is printed as a labeled group.
- Paths are forwarded to every plugin. A plugin skips paths it doesn't handle, so `opx lint README.md` only lints that file with the Markdown plugin.
- Files ignored by your `.gitignore` are ignored by the linters as well.
- If no linters are enabled, it prints a hint to run `opx init` and exits `0`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Clean, or nothing to lint |
| `1` | At least one plugin reported errors |
