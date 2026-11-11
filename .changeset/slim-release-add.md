---
"@allons-y/opx-release": minor
---

`opx release add` now runs changesets' own prompt in a terminal, instead of a copy of it, so `--open`, `--since`, and changesets' package list work as documented. The flag path (`--type`, `--pkg`, `--summary`, `--empty`) stays: it's the one way to record a change without prompting. It now offers the same packages as changesets, so `ignore`d packages are rejected and private packages are allowed when `privatePackages.version` is on. The plugin no longer ships `@clack/prompts`.
