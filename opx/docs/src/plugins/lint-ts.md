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
yarn add --dev @allons-y/opx-lint-ts typescript
```

`typescript` 5 or newer is a required peer dependency, because `typescript-eslint` loads it. Then turn the plugin on in `.opx/config.json`:

```json
{
  "version": 1,
  "lint": { "ts": true }
}
```

## Covers

| Files | Rules |
| --- | --- |
| `.ts`, `.tsx`, `.mts`, `.cts` | `typescript-eslint`, `@stylistic/eslint-plugin` |

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
