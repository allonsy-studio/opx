---
layout: layouts/docs.njk
title: opx test
description: Run the tests, with optional coverage.
eleventyNavigation:
    parent: CLI
    key: opx test
    order: 8
---

Run the enabled test plugin ([`@allons-y/opx-test`](../../plugins/test/)).

## Synopsis

```sh
opx test [--coverage] [args...]
```

| Option | What it does |
| --- | --- |
| `--coverage` | Run the tests under c8 and check the `test.coverage` thresholds in `.opx/config.json` |
| *(anything else)* | Passed to `node --test`, such as test paths or `--test-name-pattern` |

With no test plugin enabled it prints a hint and exits `0`. An enabled plugin that can't be loaded makes it exit `1`. A failing test run exits with `node --test`'s exit code; a run whose coverage is below a threshold exits `1`. See the plugin page for [thresholds](../../plugins/test/#coverage).
