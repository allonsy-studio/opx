---
layout: layouts/docs.njk
title: opx scan
description: Report which plugins match the committed tree.
eleventyNavigation:
    parent: CLI
    key: opx scan
    order: 2
---

Report which plugins would activate for the files in `HEAD`.

## Synopsis

```sh
opx scan [--report] [--json] [--strict]
```

## Options

| Flag | Description |
| --- | --- |
| `--report` | Force plain-text output |
| `--json` | Print machine-readable JSON |
| `--strict` | Exit `1` if a plugin matches your files but isn't enabled |

## JSON output

```json
{
  "branch": "main",
  "fileTypes": [".js", ".json", ".md"],
  "enabled": ["js"],
  "suggestions": [
    {
      "shortName": "md",
      "pkg": "@allons-y/opx-lint-md",
      "reason": "Files matching md found in the committed tree.",
      "installed": true
    }
  ],
  "needsPrompt": ["md"]
}
```

| Field | Meaning |
| --- | --- |
| `branch` | Current git branch |
| `fileTypes` | Sorted file extensions found in `HEAD` |
| `enabled` | Plugins enabled in `.opx/config.json` (lint plugins, plus `release` if on) |
| `suggestions` | Plugins that match, with whether their package is installed |
| `needsPrompt` | Short names of file-based suggestions that aren't enabled |

## Using it in CI

```sh
opx scan --strict
```

fails the job when the repo contains files that an available plugin could lint but that aren't enabled.
