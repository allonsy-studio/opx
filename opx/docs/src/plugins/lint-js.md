---
layout: layouts/docs.njk
title: lint-js
description: JavaScript and TypeScript linting and formatting.
eleventyNavigation:
    parent: Plugins
    key: lint-js
    order: 1
---

`@allons-y/opx-lint-js` lints **JavaScript and TypeScript** with ESLint, [`@stylistic/eslint-plugin`](https://eslint.style), and [`typescript-eslint`](https://typescript-eslint.io), pre-configured. The same config owns both lint rules and formatting, so there's no separate Prettier step.

## Install

```sh
yarn add --dev @allons-y/opx-lint-js
yarn opx enable js
```

`typescript` 5 or newer must be installed in your project, because `typescript-eslint` loads it.

## Covers

| Files | Rules |
| --- | --- |
| `.js`, `.mjs`, `.cjs`, `.jsx` | `@eslint/js`, `@stylistic/eslint-plugin` |
| `.ts`, `.tsx`, `.mts`, `.cts` | `typescript-eslint`, `@stylistic/eslint-plugin` |

## Configure

Use your own flat config instead of the bundled one:

```json
{
  "version": 1,
  "lint": { "js": "./eslint.config.js" }
}
```

## Export

The flat config is exported as a plain array at `@allons-y/opx-lint-js/eslint.config.js`:

```js
import js from "@allons-y/opx-lint-js/eslint.config.js";

export default [
	...js,
	{ files: ["**/*.ts"], rules: { "no-console": "warn" } },
];
```
