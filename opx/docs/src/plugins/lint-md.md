---
layout: layouts/docs.njk
title: lint-md
description: Markdown linting.
eleventyNavigation:
    parent: Plugins
    key: lint-md
    order: 3
---

`@allons-y/opx-lint-md` lints **Markdown** with ESLint and [`@eslint/markdown`](https://github.com/eslint/markdown), pre-configured.

## Install

```sh
yarn add --dev @allons-y/opx-lint-md
yarn opx enable md
```

## Covers

| Files | Language mode |
| --- | --- |
| `.md` | `markdown/commonmark` |
| `.mdx` | `markdown/gfm` |

GitHub pull request and issue templates (`.github/PULL_REQUEST_TEMPLATE*`, `.github/ISSUE_TEMPLATE/**`) are ignored, because their task lists and placeholders trip Markdown rules.

## Configure

Replace the bundled config with your own flat config:

```json
{
  "version": 1,
  "lint": { "md": "./eslint.markdown.config.js" }
}
```

## Export

The flat config is exported at `@allons-y/opx-lint-md/eslint.config.js`. See [Compose your ESLint config](../../guides/compose-eslint/).
