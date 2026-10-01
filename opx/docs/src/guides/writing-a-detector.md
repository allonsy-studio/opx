---
layout: layouts/docs.njk
title: Writing a detector
description: Build an opx plugin.
eleventyNavigation:
    parent: Guides
    key: Writing a detector
    order: 3
---

A **detector** is a plugin: it says when it applies to a repository and how to run its tool. Install the engine for the types:

```sh
yarn add --dev @allons-y/opx
```

## The contract

```ts
import type { Detector } from "@allons-y/opx";

export const fooDetector: Detector = {
	id: "@acme/opx-plugin-foo",
	shortName: "foo",
	displayName: "Foo (linter)",
	concern: "lint",
	fileTypes: [".foo"],

	detect: (ctx) => ctx.fileTypes.has(".foo"),

	describe: () => ({
		summary: "Runs foo over .foo files",
		bundledDeps: ["foo"],
	}),

	async run(ctx, args) {
		// Run your tool, write results with ctx.write(), and return an exit code.
		return 0;
	},
};

export default fooDetector;
```

| Field | Purpose |
| --- | --- |
| `id` | The package name |
| `shortName` | The key users put in `.opx/config.json` and pass to `opx enable` |
| `concern` | `lint`, `build`, `test`, or `release`. A command only runs detectors for its own concern. |
| `fileTypes` | Extensions the detector handles |
| `detect(ctx)` | Whether the plugin applies to this repository |
| `describe(ctx)` | A summary and the tools it bundles |
| `run(ctx, args)` | Does the work and returns an exit code. `args` are the paths the user passed. |

Write report output through `ctx.write()` rather than `process.stdout`, so opx can group output from concurrent detectors. Read `ctx.fix` to know whether `--fix` was passed, and `ctx.config` for the user's settings.

## Naming & packaging

opx loads a plugin only if it is in the project's dependencies and its name matches one of:

- `opx-plugin-<name>`
- `@scope/opx-plugin-<name>`
- `@allons-y/opx-<name>` (first-party)

The package's **default export** must be a `Detector` or an array of them. Users enable it with `opx enable <name>`, which accepts the short name or the full package id.

## A reference implementation

[`@allons-y/opx-lint-js`](https://github.com/allonsy-studio/opx/tree/main/opx/lint-js/src) is a small, complete detector. The full set of types is in the [API reference](../../api/).
