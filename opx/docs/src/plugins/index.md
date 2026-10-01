---
layout: layouts/docs.njk
title: Plugins
description: The official opx plugins.
eleventyNavigation:
    key: Plugins
    order: 4
---

| Plugin | Short name | Task | Covers |
| --- | --- | --- | --- |
| [`@allons-y/opx-lint-js`](./lint-js/) | `js` | lint | JavaScript and TypeScript |
| [`@allons-y/opx-lint-json`](./lint-json/) | `json` | lint | JSON, JSONC, JSON5 |
| [`@allons-y/opx-lint-md`](./lint-md/) | `md` | lint | Markdown and MDX |
| [`@allons-y/opx-release`](./release/) | `release` | release | Changesets release flow |

All official plugins require Node.js 24 or newer and [`@allons-y/opx-cli`](../cli/). Want one that isn't here? See [Writing a detector](../guides/writing-a-detector/).

## Common behavior

The three lint plugins share these behaviors.

- They run ESLint through its Node API, with a per-plugin cache in `.opx/cache/eslint/`.
- Files ignored by your `.gitignore` are ignored.
- Each bundles a flat config that you can [spread into your own `eslint.config.js`](../guides/compose-eslint/).
- Setting the plugin to a path, as in `"js": "./eslint.config.js"`, replaces the bundled config with yours. Paths resolve from the repository root.
