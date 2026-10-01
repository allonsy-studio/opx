---
layout: layouts/docs.njk
title: CLI
description: Every opx command, its options, and its exit codes.
eleventyNavigation:
    key: CLI
    order: 3
---

| Command | Purpose |
| --- | --- |
| [`opx init`](./init/) | Interactively set up opx for this repo |
| [`opx scan`](./scan/) | Report which plugins match the committed tree |
| [`opx enable`](./enable/) | Enable a plugin |
| [`opx disable`](./disable/) | Disable a plugin |
| [`opx lint`](./lint/) | Run every enabled linter |
| [`opx build`](./build/) | Run every enabled builder |
| [`opx release`](./release/) | Drive the release flow |
| [`opx hook`](./hook/) | Internal: invoked by the git hook |

## Global options

| Flag | Description |
| --- | --- |
| `--debug` | Print verbose logs and full stack traces on errors |
| `-V, --version` | Print the CLI version |
| `-h, --help` | Show help for `opx` or a subcommand |

## Environment

| Variable | Effect |
| --- | --- |
| `CI` | Forces non-interactive behavior |
| `OPX_NONINTERACTIVE` | Forces non-interactive behavior |

opx also runs non-interactively whenever stdout is not a TTY.

## Errors

Runtime errors print as a single `opx: <message>` line and exit `1`. Pass `--debug` for the stack trace.
