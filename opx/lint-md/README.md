# @allons-y/opx-lint-md

opx detector + runner for **Markdown**. Bundles ESLint with [`@eslint/markdown`](https://github.com/eslint/markdown), pre-configured.

## Install

Install via `opx init` (recommended):

```sh
opx init
# answer "yes" when prompted to enable md
```

Or manually:

```sh
yarn add --dev @allons-y/opx-lint-md
opx enable md
```

Requires [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli).

## What it covers

| File types | Language mode |
|---|---|
| `.md` | `markdown/commonmark` |
| `.mdx` | `markdown/gfm` |

## Running

After enabling, run via the opx CLI:

```sh
opx lint
opx lint docs
```

Lint runs through ESLint's Node API with caching at `.opx/cache/eslint/cache`.

## Override the config

To swap in your own ESLint flat config, set `overrides.md.eslint` in `opx.config.json`:

```json
{
  "version": 1,
  "lint": ["md"],
  "overrides": {
    "md": { "eslint": "./eslint.markdown.config.js" }
  }
}
```

Paths are resolved relative to the host repo root.

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.llc) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
