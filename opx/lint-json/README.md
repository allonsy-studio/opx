# @allons-y/opx-lint-json

opx detector + runner for **JSON**, with optional **JSONC** and **JSON5** support. Bundles ESLint with [`@eslint/json`](https://github.com/eslint/json), pre-configured.

## Install

Install via `opx init` (recommended):

```sh
opx init
# answer "yes" when prompted to enable json
# then pick whether to also lint .jsonc and/or .json5
```

Or manually:

```sh
yarn add --dev @allons-y/opx-lint-json
opx enable json
```

Requires [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli).

## What it covers

| File type | Language mode | Default |
|---|---|---|
| `.json` | `json/json` | always on |
| `.jsonc` | `json/jsonc` | opt-in |
| `.json5` | `json/json5` | opt-in |

JSONC and JSON5 are off by default — `opx init` asks whether to enable them and persists the choice in `opx.config.json`:

```json
{
  "version": 1,
  "lint": ["json"],
  "overrides": {
    "json": { "dialects": "jsonc,json5" }
  }
}
```

You can edit `overrides.json.dialects` by hand at any time (comma-separated: `jsonc`, `json5`, or both).

## Running

After enabling, run via the opx CLI:

```sh
opx lint
opx lint package.json tsconfig.json
```

When no paths are passed, the runner lints `**/*.json` plus the enabled dialect globs. Caching writes to `.opx/cache/eslint/cache`.

## Override the config

To swap in your own ESLint flat config, set `overrides.json.eslint` in `opx.config.json`:

```json
{
  "version": 1,
  "lint": ["json"],
  "overrides": {
    "json": { "eslint": "./eslint.json.config.js" }
  }
}
```

Paths are resolved relative to the host repo root.

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
