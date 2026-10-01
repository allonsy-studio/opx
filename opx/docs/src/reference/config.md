---
layout: layouts/docs.njk
title: Configuration
description: Every key in .opx/config.json.
eleventyNavigation:
    parent: Reference
    key: Configuration
    order: 1
---

opx reads `.opx/config.json` from the repository root. `opx init` and [`opx enable`](../../cli/enable/) write it; you can edit it by hand.

```json
{
  "$schema": "https://unpkg.com/@allons-y/opx/schema/config.json",
  "version": 1,
  "lint": { "js": true, "json": true, "md": true },
  "release": true,
  "test": false
}
```

## Keys

| Key | Type | Description |
| --- | --- | --- |
| `$schema` | string | Optional. Enables editor validation and completion. |
| `version` | `1` | Required. The config format version. |
| `lint` | object | Lint plugins, keyed by short name |
| `build` | object | Build plugins, keyed by short name |
| `release` | plugin setting | Enables the release plugin |
| `test` | plugin setting | Reserved for a future test plugin |

Short names must be lowercase letters and digits (`js`, `md`).

## Plugin settings

Wherever a plugin is configured, the value can be any one of:

| Value | Meaning |
| --- | --- |
| `true` | Enabled with defaults |
| `false` | Disabled |
| `"./path.js"` | Enabled, using your own config file. Resolved from the repository root. |
| `{ ... }` | Enabled, with inline settings the plugin understands |

### Examples

Use your own ESLint flat config for JavaScript, and lint JSONC and JSON5 too:

```json
{
  "version": 1,
  "lint": {
    "js": "./eslint.config.js",
    "json": { "dialects": ["jsonc", "json5"] }
  }
}
```

The settings each plugin understands are documented on its page: [js](../../plugins/lint-js/), [json](../../plugins/lint-json/), [md](../../plugins/lint-md/), [release](../../plugins/release/).

## Defaults and errors

- If `.opx/config.json` doesn't exist, opx behaves as if every task were empty and `release` and `test` were `false`.
- If it exists but isn't a valid JSON object, opx stops with an error that names the file.

## State file

`.opx/state.json` is written by opx for its own bookkeeping. You shouldn't need to edit it, and it shouldn't be committed.

```json
{
  "version": 1,
  "lastScanCommit": "a1b2c3d",
  "deferrals": {
    "md": { "branch": "main", "skipUntilDate": "2026-10-07", "reason": "later" }
  }
}
```
