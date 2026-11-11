# @allons-y/opx-cli

The `opx` command-line interface. Scans the committed tree of a git repository, suggests language tooling, and drives lint, build, and release via opx detectors.

## Install

```sh
yarn add --dev @allons-y/opx-cli@beta
# or
npm i -D @allons-y/opx-cli@beta
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
| `opx init` | Interactive setup (`--yes` or `--accept js,md` skips the prompts): pick detectors, install packages, wire a `lint` script and post-commit hook, and, with `--cleanup`, show what your enabled plugins suggest dropping, deleting only empty files git can restore. |
| `opx enable <name>` | Enable a detector by short name (`js`, `md`, `json`, ...) or fully-qualified package id. Use `--task lint\|build` to target a concern. |
| `opx disable <name>` | Disable a detector (also accepts `--task`). |
| `opx lint [paths...]` | Run every enabled lint detector. `--fix` auto-fixes where supported. |
| `opx build [paths...]` | Run every enabled build detector. |
| `opx release [args...]` | Drive the release flow; forwards subcommands to the releaser (changesets). |
| `opx hook` | Internal — invoked by the post-commit git hook. |

Run `opx <command> --help` for per-command flags.

## Using opx with an AI agent

opx is built to be driven by an agent with no human in the loop. It never prompts without a terminal, and every command has a clear exit code.

1. Install the CLI with the project's package manager: `yarn add --dev @allons-y/opx-cli@beta`.
2. Run `opx scan --json`. `suggestions` lists matching plugins, `install` and `setup` are the commands to run, and `packageManager` says which manager opx will use.
3. Run `opx init --yes` to set up every plugin your files match, or `opx init --accept js,md,release` to choose. It installs packages, writes `.opx/config.json`, scaffolds `eslint.config.js`, adds a `lint` script, and installs the git hook.
4. Run `opx lint`. Exit `0` is clean and `1` means problems; `opx lint --fix` applies fixes.
5. Commit `.opx/config.json`, `eslint.config.js`, `package.json`, the lockfile, and `.husky/`.

Don't hand-edit `.opx/state.json`. Use `opx enable <name>` and `opx disable <name>` to change plugins afterwards. The docs site publishes an [`llms.txt`](https://projects.allons-y.studio/opx/llms.txt) index, and the full guide is [Use opx with an AI agent](https://projects.allons-y.studio/opx/guides/agents/).

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
