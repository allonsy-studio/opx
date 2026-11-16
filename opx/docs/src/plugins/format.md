---
layout: layouts/docs.njk
title: format
description: Formatting with Prettier.
eleventyNavigation:
    parent: Plugins
    key: format
    order: 5
---

`@allons-y/opx-format` formats with [Prettier](https://prettier.io), pre-configured. Prettier owns whitespace, line wrapping, quotes, and semicolons for every file type opx lints, so the lint plugins check code and leave layout alone.

## Install

```sh
yarn add --dev @allons-y/opx-format
yarn opx enable format
```

`opx init` suggests `format` whenever it suggests a lint plugin.

## Covers

It formats the file types of your enabled lint plugins. With none of them enabled, it covers all of them.

| Plugin | Files                         |
| ------ | ----------------------------- |
| `js`   | `.js`, `.mjs`, `.cjs`, `.jsx` |
| `ts`   | `.ts`, `.tsx`, `.mts`, `.cts` |
| `json` | `.json`, `.jsonc`, `.json5`   |
| `md`   | `.md`, `.mdx`                 |

## How it runs

Format is a [phase](../../guides/writing-a-detector/#phases) of `opx lint`, not a separate command. It runs before the other lint plugins, on the same paths, so they check the formatted result.

| Command          | Prettier                                                                      |
| ---------------- | ----------------------------------------------------------------------------- |
| `opx lint`       | `--check`: lists the files that need formatting and exits `1`                 |
| `opx lint --fix` | `--write`: formats the files, lists what changed, then runs the other linters |

A file Prettier can't parse is reported and fails the run, in either mode.

Prettier skips files in your `.gitignore` and `.prettierignore`. opx also skips `node_modules`, `.yarn`, `.pnp.*`, `.opx`, `bin`, and `dist`.

## Defaults

| Option                      | Value                                        |
| --------------------------- | -------------------------------------------- |
| `useTabs` / `tabWidth`      | tabs, 4 columns wide                         |
| `printWidth`                | 120                                          |
| `singleQuote`               | `false` (double quotes)                      |
| `semi`                      | `true`                                       |
| `trailingComma`             | `"all"`                                      |
| `*.json` (`useTabs: false`) | two spaces, since JSON files rarely use tabs |

## Configure

Point `lint.format` at your own Prettier config. The path resolves from the repository root:

```json
{
	"version": 1,
	"lint": { "format": "./prettier.config.js" }
}
```

Without it, opx uses its bundled config and ignores any Prettier config in the project, so `opx lint` gives the same result everywhere. Set the path when you want your own rules, and so your editor and `opx lint` agree.

## Export

The default config is exported at `@allons-y/opx-format/prettier`. Spread it into your own `prettier.config.js`:

```js
import base from "@allons-y/opx-format/prettier";

/** @type {import("prettier").Config} */
export default {
	...base,
	printWidth: 100,
};
```

## Moving from `@stylistic`

`@allons-y/opx-lint-js` and `@allons-y/opx-lint-ts` no longer format, so their `@stylistic` rules are gone. Enable `format` to keep your code formatted. Run `opx lint --fix` once to apply Prettier's layout, and expect a one-time diff from line wrapping.
