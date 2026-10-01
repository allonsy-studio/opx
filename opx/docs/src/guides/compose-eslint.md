---
layout: layouts/docs.njk
title: Compose your ESLint config
description: Combine opx's lint configs with your own rules so your editor matches opx lint.
eleventyNavigation:
    parent: Guides
    key: Compose your ESLint config
    order: 1
---

`opx lint` runs each plugin as its own scoped ESLint pass, so it needs no root config. Your **editor** and a plain `eslint .` do want a single `eslint.config.js`. Every opx lint package exports its flat config as a plain array, so you compose them by spreading. `opx init` writes this file for you and never overwrites an existing one.

```js
// eslint.config.js
import js from "@allons-y/opx-lint-js/eslint.config.js";
import json from "@allons-y/opx-lint-json/eslint.config.js";
import md from "@allons-y/opx-lint-md/eslint.config.js";

export default [...js, ...json, ...md];
```

## Add third-party plugins & your own rules

Each block in opx's configs is scoped with `files`, so they don't collide. Flat config is evaluated top to bottom and the last matching block wins, so put opx first and your overrides last:

```js
import js from "@allons-y/opx-lint-js/eslint.config.js";
import react from "eslint-plugin-react";

export default [
	...js,
	{
		files: ["**/*.{jsx,tsx}"],
		plugins: { react },
		rules: react.configs.recommended.rules,
	},
	{
		files: ["**/*.test.ts"],
		rules: { "@stylistic/quotes": "off" },
	},
];
```

## Use as little as you like

Spread only `@allons-y/opx-lint-js` and bring your own JSON and Markdown configs, or drop opx's lint packages from `eslint.config.js` entirely and keep using `opx release`. The plugins, the exported configs, and your own rules are independent.
