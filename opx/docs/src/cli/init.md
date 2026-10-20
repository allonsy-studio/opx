---
layout: layouts/docs.njk
title: opx init
description: Interactively set up opx for this repo.
eleventyNavigation:
    parent: CLI
    key: opx init
    order: 1
---

Scan the committed tree and interactively wire up opx.

## Synopsis

```sh
opx init [--auto] [--quiet] [--no-cleanup]
```

## Options

| Flag | Default | Description |
| --- | --- | --- |
| `--auto` | `false` | Only proceed in an interactive terminal. Intended for `postinstall` scripts. |
| `--quiet` | `false` | Suppress informational output when `--auto` exits early |
| `--no-cleanup` | cleanup on | Skip the [cleanup suggestions](#cleanup) from your plugins |

## What it does

1. Creates `.opx/config.json` if there isn't one.
2. For each suggested plugin not yet enabled, asks **Yes**, **No**, or **Later**. "Later" records a deferral in `.opx/state.json` for the current branch.
3. Saves your choices and offers to install any missing packages with the detected package manager (npm, yarn, or pnpm).
4. Scaffolds a root `eslint.config.js` composed from your enabled lint plugins. It never overwrites an existing file.
5. Offers to add `"lint": "opx lint"` to your `package.json` scripts.
6. Installs the `post-commit` husky hook and updates `.gitignore` to ignore `.opx/*` except `.opx/config.json`, which stays tracked.
7. Shows the [cleanup suggestions](#cleanup) your enabled plugins make, and offers to delete empty files they replace.

## Cleanup

Each enabled plugin knows what it makes unnecessary, so each one suggests its own cleanup. `opx init` prints those suggestions and does very little itself. It deletes a file only when **all** of these hold:

1. The plugin suggested it, and it is a regular file inside the repository (not a symlink or a folder).
2. It is **empty**: nothing but whitespace, comments, or `{}`.
3. git can restore it: it is tracked and unchanged since `HEAD`.

It asks once before deleting. Everything else is advice for you to act on. opx never edits `package.json`, never edits your `eslint.config.js`, and never runs a command a plugin suggests, including your package manager.

For example, with `lint-js`, `lint-json`, `lint-md`, or `lint-ts` enabled:

| What | What opx does |
| --- | --- |
| An empty `.eslintrc*` or `.eslintignore` that git can restore | Offers to delete it. |
| A legacy ESLint config with content (`.eslintrc*`, `.eslintignore`, `eslintConfig` or `eslintIgnore` in `package.json`) | Tells you opx does not apply it, and where to move what you still want: your override file if you set `lint.<name>`, otherwise a new flat config you point it at. For an `.eslintrc*` file it prints `npx @eslint/migrate-config <file>`, unless a flat config already exists, since that command overwrites one. You run it and delete the file. |
| A package the plugin bundles (`eslint`, `globals`, …) that you list in `devDependencies` | Prints the `remove` command for your package manager, with the version the plugin ships, if nothing in the project appears to use it. |

A package is held back, and shown under "Keeping", when:

- the project uses it: an `import`, `require`, or quoted reference in a source or config file, or a command in a `package.json` script, `.husky` hook, lint-staged config, or workflow;
- it is also listed under `dependencies`, `peerDependencies`, or `optionalDependencies`, which removing it would change; or
- opx cannot list the project's files to check.

A plugin is only consulted when it is enabled and installed. Because the suggestions ship with the plugin, they match the version you have. See [Writing a detector](../../guides/writing-a-detector/) to add them to your own plugin.

## Non-interactive use

With no TTY, `CI` set, or `OPX_NONINTERACTIVE` set, `init` prints the suggestions and the commands to run instead of prompting. Use [`opx enable`](../enable/) to apply them. It also prints the cleanup suggestions, and changes nothing. `init --auto` (postinstall) never shows them.
