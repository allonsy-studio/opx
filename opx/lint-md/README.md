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

Lint runs through ESLint's Node API with caching at `.opx/cache/eslint/md`.

## Override the config

To swap in your own ESLint flat config, set `lint.md` in `.opx/config.json`:

```json
{
  "version": 1,
  "lint": {
    "md": "./eslint.markdown.config.js"
  }
}
```

Paths are resolved relative to the host repo root.

The default config ignores GitHub markdown templates (`.github/PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/**`), whose task-list and placeholder syntax otherwise trips Markdown rules.

## Compose with other configs

The flat config is exported at `@allons-y/opx-lint-md/eslint.config.js` as a plain array. Spread it into your own root `eslint.config.js` alongside the other opx lint configs and any third-party plugins:

```js
import js from "@allons-y/opx-lint-js/eslint.config.js";
import md from "@allons-y/opx-lint-md/eslint.config.js";

export default [
  ...js,
  ...md,
  { files: ["**/*.md"], rules: { "markdown/no-html": "off" } },
];
```

Every block is `files`-scoped, so it composes without clobbering other languages. `opx init` scaffolds this file for you. See the [monorepo README](https://github.com/allonsy-studio/opx#composing-lint-configs-mix-and-match) for the full mix-and-match guide.

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
