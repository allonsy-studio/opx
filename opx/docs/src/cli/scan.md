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
      "installed": true,
      "requires": []
    }
  ],
  "needsPrompt": ["md"],
  "packageManager": { "name": "yarn", "certain": true, "reason": "packageManager field" },
  "install": "yarn add -D @allons-y/opx-lint-md@beta",
  "setup": "opx init --accept md"
}
```

| Field | Meaning |
| --- | --- |
| `branch` | Current git branch |
| `fileTypes` | Sorted file extensions found in `HEAD` |
| `enabled` | Plugins enabled in `.opx/config.json` (lint plugins, plus `release` if on) |
| `suggestions` | Plugins that match, with whether their package is installed and any `requires`: packages your project must install itself (the `ts` plugin needs `typescript`) |
| `needsPrompt` | Short names of file-based suggestions that aren't enabled |
| `packageManager` | The package manager opx would use, whether it is `certain`, and `reason` it chose it |
| `install` | The command that installs the packages in `needsPrompt` that are missing, or `null`. Pinned to the dist-tag while the CLI is a prerelease. |
| `setup` | The `opx init --accept` command that enables everything in `needsPrompt`, or `null` |

`release` is always suggested because opx can't detect it from files. Its reason reads "Not detectable from files; enable it if you publish packages." and it never counts toward `--strict`.

## Using it in CI

```sh
opx scan --strict
```

fails the job when the repo contains files that an available plugin could lint but that aren't enabled.
