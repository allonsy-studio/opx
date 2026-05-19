# @allons-y/opx-lint-js

opx detector + runner for **JavaScript and TypeScript**. Bundles ESLint with [`@stylistic/eslint-plugin`](https://eslint.style) and [`typescript-eslint`](https://typescript-eslint.io), pre-configured.

## Install

Install via `opx init` (recommended):

```sh
opx init
# answer "yes" when prompted to enable js
```

Or manually:

```sh
yarn add --dev @allons-y/opx-lint-js
opx enable js
```

Requires [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli).

## What it covers

| File types | Plugins |
|---|---|
| `.js`, `.mjs`, `.cjs`, `.jsx` | `@eslint/js`, `@stylistic/eslint-plugin` |
| `.ts`, `.tsx`, `.mts`, `.cts` | `typescript-eslint`, `@stylistic/eslint-plugin` |

The bundled flat config owns both **semantic lint** and **formatting** — there is no separate Prettier step.

## Running

After enabling, run via the opx CLI:

```sh
opx lint
opx lint src
```

Lint runs through ESLint's Node API with caching at `.opx/cache/eslint/cache`.

## Override the config

To swap in your own ESLint flat config, set `overrides.js.eslint` in `opx.config.json`:

```json
{
  "version": 1,
  "lint": ["js"],
  "overrides": {
    "js": { "eslint": "./eslint.config.js" }
  }
}
```

Paths are resolved relative to the host repo root.

## Requirements

- Node.js ≥ 24
- `typescript` ≥ 5 in the host repo (peer; `typescript-eslint` loads it at config-load time)

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
