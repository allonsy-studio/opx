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
| `cleanup(ctx)` | Optional. What the project can drop now that your plugin is enabled. See [Suggesting cleanup](#suggesting-cleanup). |
| `run(ctx, args)` | Does the work and returns an exit code. `args` are the paths the user passed. |

Write report output through `ctx.write()` rather than `process.stdout`, so opx can group output from concurrent detectors. Read `ctx.fix` to know whether `--fix` was passed, and `ctx.config` for the user's settings.

## Suggesting cleanup

A plugin often replaces tools a project already has, and it knows the exact tool version it ships. Implement `cleanup(ctx)` to say what the project can drop or update:

```ts
cleanup: (ctx) => [
	{ kind: "dependency", target: "foo-cli", reason: "bundled by @acme/opx-plugin-foo at 3.2.1" },
	{
		kind: "file",
		target: ".foorc.json",
		reason: "opx uses its own config, not this",
		hint: "Move any rules you still want into your override, then delete it.",
		command: { run: ["npx", "foo-migrate", ".foorc.json"], description: "Convert it" },
	},
	{ kind: "setting", target: "fooConfig", reason: "not applied", hint: "Move it into your override, then remove the key from package.json." },
],
```

| `kind` | `target` is |
| --- | --- |
| `dependency` | A package name |
| `file` | A path from the repository root |
| `setting` | A top-level `package.json` key |

`command` is optional, for a `file` or `setting` where the tool can do the conversion itself. It is a program and its arguments, printed as `Run: …`. opx never runs it, and drops one that is not a non-empty list of strings. Dependencies need none; opx builds the `remove` command for the project's package manager.

You suggest; opx decides. It checks the thing exists, and it only deletes a `file` that is empty and unchanged in git. Dependencies and settings are printed for the person to act on, so you never need to guess whether something is safe to remove. Do not suggest anything that holds content you cannot see is redundant. Use `hint` to say how to move it instead.

Because `cleanup` receives `ctx`, it can adapt to the project. Read `ctx.config` to see whether the person overrides your config, and check `ctx.cwd` before offering a command that could overwrite a file. The ESLint plugins do both: they name the override file as the place to move rules, and they withhold `@eslint/migrate-config` when a flat config already exists, because it overwrites one.

Say which version you ship. A plugin's dependencies are its own, so a project's older copy is replaced by yours. The ESLint plugins read each bundled package's version with `findPackageJSON` and put it in the `reason`. Pass your own `import.meta.url` so the package resolves from where your plugin is installed.

Pin the tools you ship to exact versions in `dependencies` (`"eslint": "10.11.0"`, not `"^10.11.0"`). Then the version you name is the version everyone gets, and your configuration and advice are written against it. Let a dependency bot bump the pin, and release the plugin when it does.

## Naming & packaging

opx loads a plugin only if it is in the project's dependencies and its name matches one of:

- `opx-plugin-<name>`
- `@scope/opx-plugin-<name>`
- `@allons-y/opx-<name>` (first-party)

The package's **default export** must be a `Detector` or an array of them. Users enable it with `opx enable <name>`, which accepts the short name or the full package id.

## A reference implementation

[`@allons-y/opx-lint-js`](https://github.com/allonsy-studio/opx/tree/main/opx/lint-js/src) is a small, complete detector. The full set of types is in the [API reference](../../api/).
