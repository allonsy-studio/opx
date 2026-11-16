# @allons-y/opx-format

opx detector + runner for **formatting**. Bundles [Prettier](https://prettier.io), pre-configured. Prettier owns whitespace, line wrapping, quotes, and semicolons for every file type opx lints, so the lint plugins can check code and leave layout alone.

## Install

Install via `opx init` (recommended). It suggests `format` whenever it suggests a lint plugin:

```sh
opx init
# answer "yes" when prompted to enable format
```

Or manually:

```sh
yarn add --dev @allons-y/opx-format
opx enable format
```

Requires [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli).

## What it covers

Prettier formats the file types of your enabled lint plugins:

| Plugin | File types                    |
| ------ | ----------------------------- |
| `js`   | `.js`, `.mjs`, `.cjs`, `.jsx` |
| `ts`   | `.ts`, `.tsx`, `.mts`, `.cts` |
| `json` | `.json`, `.jsonc`, `.json5`   |
| `md`   | `.md`, `.mdx`                 |

With none of those enabled, it covers all of them.

## Running

The format plugin runs first, before the other lint plugins, so they check the formatted result.

```sh
opx lint        # prettier --check: lists files that need formatting, exits 1
opx lint --fix  # prettier --write: formats them, then runs the other linters
opx lint docs   # only the given paths
```

Files ignored by your `.gitignore` or `.prettierignore` are skipped, and so are `node_modules`, `.yarn`, `.pnp.*`, `.opx`, `bin`, and `dist`.

## Defaults

| Option                      | Value                                        |
| --------------------------- | -------------------------------------------- |
| `useTabs` / `tabWidth`      | tabs, 4 columns wide                         |
| `printWidth`                | 120                                          |
| `singleQuote`               | `false` (double quotes)                      |
| `semi`                      | `true`                                       |
| `trailingComma`             | `"all"`                                      |
| `*.json` (`useTabs: false`) | two spaces, since JSON files rarely use tabs |

## Override the config

Point `lint.format` in `.opx/config.json` at your own Prettier config. The path resolves from the repository root:

```json
{
	"version": 1,
	"lint": {
		"format": "./prettier.config.js"
	}
}
```

Without it, opx uses its bundled config and ignores any Prettier config in the project, so `opx lint` gives the same result everywhere. Set the path when you want your own rules, and so your editor and `opx lint` agree.

## Extend the default config

The default config is exported at `@allons-y/opx-format/prettier`. Spread it into your own `prettier.config.js`:

```js
import base from "@allons-y/opx-format/prettier";

/** @type {import("prettier").Config} */
export default {
	...base,
	printWidth: 100,
};
```

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
