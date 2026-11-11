---
layout: layouts/docs.njk
title: lint-ts
description: TypeScript linting and formatting.
eleventyNavigation:
    parent: Plugins
    key: lint-ts
    order: 4
---

`@allons-y/opx-lint-ts` lints **TypeScript** with ESLint, [`typescript-eslint`](https://typescript-eslint.io), and [`@stylistic/eslint-plugin`](https://eslint.style), pre-configured. The same config owns both lint rules and formatting, so there's no separate Prettier step. JavaScript is covered by [lint-js](../lint-js/).

## Install

```sh
yarn add --dev @allons-y/opx-lint-ts
```

`typescript` 5 or 6 is a required peer dependency, because `typescript-eslint` loads it. Most projects already have it; if yours doesn't, your package manager warns, and `opx init` installs it for you. TypeScript 7 is not supported yet: it has no programmatic API for `typescript-eslint` to load. The supported range is this package's `peerDependencies`. opx never changes a version your project already uses; it warns if that version is outside the range. See [Peer dependencies](../../cli/init/#peer-dependencies). Then turn the plugin on in `.opx/config.json`:

```json
{
  "version": 1,
  "lint": { "ts": true }
}
```

## Move from lint-js 0.x

`@allons-y/opx-lint-js` 0.x also linted TypeScript. From 1.0 it lints JavaScript only, so upgrading it without adding lint-ts silently stops TypeScript linting. Running both versions side by side lints every `.ts` file twice, with two rule sets.

1. Install lint-ts & a JavaScript-only lint-js in one step:

   ```sh
   yarn add --dev @allons-y/opx-lint-ts "@allons-y/opx-lint-js@^1.0.0-beta.1"
   ```

2. Run `opx enable ts`. When your other lint plugins all point at your own `eslint.config.js`, `ts` points there too.
3. If you have your own `eslint.config.js`, spread the lint-ts config into it. `opx enable ts` prints the lines to add:

   ```js
   import js from "@allons-y/opx-lint-js/eslint.config.js";
   import ts from "@allons-y/opx-lint-ts/eslint.config.js";

   export default [
   	...js,
   	...ts,
   	// Your own rules, such as a license header for src/**/*.ts, still apply after the spreads.
   ];
   ```

`opx init` handles steps 1 & 2 when you accept `ts`, and prints the lines for step 3.

## Covers

| Files | Rules |
| --- | --- |
| `.ts`, `.tsx`, `.mts`, `.cts` | `typescript-eslint`, `@stylistic/eslint-plugin` |

Declaration files such as `types.d.ts` are linted once the plugin is on. On their own, they don't make `opx scan` or `opx init` suggest it, so a JavaScript package that ships hand-written types isn't treated as a TypeScript project.

## Configure

Use your own flat config instead of the bundled one:

```json
{
  "version": 1,
  "lint": { "ts": "./eslint.config.js" }
}
```

## Export

The flat config is exported as a plain array at `@allons-y/opx-lint-ts/eslint.config.js`:

```js
import ts from "@allons-y/opx-lint-ts/eslint.config.js";

export default [
	...ts,
	{ files: ["**/*.ts"], rules: { "no-console": "warn" } },
];
```
