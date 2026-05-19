# @allons-y/opx-cli

The `opx` command-line interface. Scans the committed tree of a git repository, suggests language tooling, and drives lint/test/build via opx detectors.

## Install

```sh
yarn add --dev @allons-y/opx-cli
# or
npm i -D @allons-y/opx-cli
```

This installs the `opx` binary. The CLI is intentionally tiny — detector packages (`@allons-y/opx-lint-js`, `@allons-y/opx-lint-md`, `@allons-y/opx-lint-json`, ...) are loaded on demand and are not pre-installed.

## Usage

```sh
opx <command> [options]
```

### Commands

| Command | What it does |
|---|---|
| `opx scan` | Scan the committed tree and report which detectors would activate. |
| `opx init` | Interactive setup: pick detectors, install packages, wire a `lint` script and post-commit hook. |
| `opx enable <name>` | Enable a detector by short name (`js`, `md`, `json`, ...) or fully-qualified package id. |
| `opx disable <name>` | Disable a detector. |
| `opx lint [paths...]` | Run every enabled lint detector. |
| `opx hook` | Internal — invoked by the post-commit git hook. |

Run `opx <command> --help` for per-command flags.

## Configuration

`opx init` writes an [`opx.config.json`](https://unpkg.com/@allons-y/opx/opx.schema.json) at the repo root. Detectors are **enabled by presence** — a detector runs iff its short name appears in the relevant concern array.

```json
{
  "version": 1,
  "lint": ["js", "json"],
  "overrides": {
    "json": { "dialects": "jsonc,json5" }
  }
}
```

## Requirements

- Node.js ≥ 24
- A git repository (the scanner reads from `git ls-tree HEAD`)

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
