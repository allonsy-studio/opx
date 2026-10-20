---
layout: layouts/docs.njk
title: lint-js
description: JavaScript linting and formatting.
eleventyNavigation:
    parent: Plugins
    key: lint-js
    order: 1
---

`@allons-y/opx-lint-js` lints **JavaScript** with ESLint and [`@stylistic/eslint-plugin`](https://eslint.style), pre-configured. TypeScript is not covered. The same config owns both lint rules and formatting, so there's no separate Prettier step.

## Install

```sh
yarn add --dev @allons-y/opx-lint-js
yarn opx enable js
```

## Covers

| Files | Rules |
| --- | --- |
| `.js`, `.mjs`, `.cjs`, `.jsx` | `@eslint/js`, `@stylistic/eslint-plugin` |

## Rules

On top of `@eslint/js` recommended, the bundled config sets these to `error` for `.js`, `.mjs` and `.cjs`:

| Rule | Why |
|---|---|
| `no-var`, `prefer-const` | Block-scoped bindings only. |
| `prefer-arrow-callback`, `object-shorthand` | Arrow callbacks and shorthand properties and methods. |
| `prefer-template` | Template literals over string concatenation. |
| `prefer-spread`, `prefer-rest-params`, `prefer-object-spread` | Spread and rest over `.apply()`, `arguments` and `Object.assign({}, …)`. |
| `no-unused-vars` with `ignoreRestSiblings` | Lets `const { omit, ...rest } = obj` drop a key without a warning. |

Most of these fix under `opx lint --fix`. `prefer-rest-params` and some `prefer-spread` cases need a manual edit. Two `@stylistic` rules, `template-curly-spacing` (`never`) and `object-curly-spacing` (`always`), keep the fixed output tidy.

Left out on purpose: `no-console`. Build scripts and CLIs write to stdout, so turn it on in your own config where it fits (for example, off for `scripts/`).

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
	{ files: ["**/*.js"], rules: { "no-console": "warn" } },
];
```
