---
layout: layouts/docs.njk
title: Use opx in CI
description: Run opx lint and opx scan in continuous integration.
eleventyNavigation:
    parent: Guides
    key: Use opx in CI
    order: 2
---

opx detects `CI` and runs non-interactively, so the same commands work locally and in a pipeline.

```yaml
# .github/workflows/lint.yml
name: Lint
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: yarn
      - run: yarn install --immutable
      - run: yarn opx lint
```

## Fail when a plugin is missing

`opx scan --strict` exits `1` when your repository contains files that an available plugin could lint but that aren't enabled. Use it to catch a new language arriving without tooling:

```yaml
      - run: yarn opx scan --strict
```

For a machine-readable result, add `--json`; see the [`opx scan` reference](../../cli/scan/).

## Releasing

Record changes with flags, since prompts aren't available in CI:

```sh
opx release add --type minor --pkg @acme/cli --summary "Add --json output"
```

See [`@allons-y/opx-release`](../../plugins/release/) for publishing.
