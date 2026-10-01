# @allons-y/opx-cli

The `opx` command-line interface. Scans the committed tree of a git repository, suggests language tooling, and drives lint, build, and release via opx detectors.

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
| `opx enable <name>` | Enable a detector by short name (`js`, `md`, `json`, ...) or fully-qualified package id. Use `--task lint\|build` to target a concern. |
| `opx disable <name>` | Disable a detector (also accepts `--task`). |
| `opx lint [paths...]` | Run every enabled lint detector. `--fix` auto-fixes where supported. |
| `opx build [paths...]` | Run every enabled build detector. |
| `opx release [args...]` | Drive the release flow; forwards subcommands to the releaser (changesets). |
| `opx hook` | Internal — invoked by the post-commit git hook. |

Run `opx <command> --help` for per-command flags.

## Configuration

`opx init` writes an [`.opx/config.json`](https://unpkg.com/@allons-y/opx/schema/config.json) at the repo root. Each concern enables its plugins by short name. The dynamic tasks (`lint`, `build`) are keyed objects; the static tasks (`release`, `test`) are booleans:

```json
{
  "version": 1,
  "lint": {
    "js": true,
    "json": true
  },
  "release": true
}
```

A plugin value may be `true`, a path to a custom config file, or an inline config object.

`opx init` also scaffolds a composable root `eslint.config.js` (from your enabled lint detectors) so editors and a plain `eslint .` match `opx lint`. See [the monorepo README](https://github.com/allonsy-studio/opx#composing-lint-configs-mix-and-match) for how to mix in third-party configs.

## Requirements

- Node.js ≥ 24
- A git repository (the scanner reads from `git ls-tree HEAD`)

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
