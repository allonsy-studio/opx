---
layout: layouts/docs.njk
title: lint-json
description: JSON, JSONC, and JSON5 linting.
eleventyNavigation:
    parent: Plugins
    key: lint-json
    order: 2
---

`@allons-y/opx-lint-json` lints **JSON** with ESLint and [`@eslint/json`](https://github.com/eslint/json), pre-configured.

## Install

```sh
yarn add --dev @allons-y/opx-lint-json
yarn opx enable json
```

## Covers

| Files | Language mode | Default |
| --- | --- | --- |
| `.json` | `json/json` | always on |
| `.jsonc` | `json/jsonc` | opt in |
| `.json5` | `json/json5` | opt in |

Lockfiles (`package-lock.json`, `npm-shrinkwrap.json`) are ignored.

## Configure

Opt in to JSONC and JSON5 with `dialects`:

```json
{
  "version": 1,
  "lint": { "json": { "dialects": ["jsonc", "json5"] } }
}
```

Or replace the bundled config with your own flat config:

```json
{
  "version": 1,
  "lint": { "json": "./eslint.json.config.js" }
}
```

## Export

The flat config is exported at `@allons-y/opx-lint-json/eslint.config.js`. See [Compose your ESLint config](../../guides/compose-eslint/).
