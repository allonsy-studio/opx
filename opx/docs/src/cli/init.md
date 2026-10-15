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
| `--no-cleanup` | cleanup on | Skip the offer to [remove what opx replaces](#cleanup) |

## What it does

1. Creates `.opx/config.json` if there isn't one.
2. For each suggested plugin not yet enabled, asks **Yes**, **No**, or **Later**. "Later" records a deferral in `.opx/state.json` for the current branch.
3. Saves your choices and offers to install any missing packages with the detected package manager (npm, yarn, or pnpm).
4. Scaffolds a root `eslint.config.js` composed from your enabled lint plugins. It never overwrites an existing file.
5. Offers to add `"lint": "opx lint"` to your `package.json` scripts.
6. Installs the `post-commit` husky hook and updates `.gitignore` to ignore `.opx/*` except `.opx/config.json`, which stays tracked.
7. Offers to [clean up](#cleanup) dependencies and config files that your enabled plugins now replace.

## Cleanup

Once a lint plugin is enabled **and installed**, some of what the project carried for linting is redundant. `opx init` lists it in one multi-select, with a reason for each item and everything pre-selected. Deselect anything you want to keep. Nothing is removed without that confirmation, and `init --auto` (postinstall) never offers it.

What it can offer:

| Item | Offered when |
| --- | --- |
| Dependencies the plugin bundles (`eslint`, `@eslint/js`, `@eslint/compat`, `@stylistic/eslint-plugin`, `globals`, `@eslint/json`, `@eslint/markdown`) | You list them yourself and nothing in the project uses them. |
| Legacy ESLint config (`.eslintrc*`, `.eslintignore`, `eslintConfig` and `eslintIgnore` in `package.json`) | Its content says nothing the bundled config does not. |

What it keeps, and tells you about:

- **A dependency the project still uses.** An `import`, `require`, or quoted reference in any tracked or untracked-but-not-ignored source or config file counts, and so does `eslint` as a command in a `package.json` script, a `.husky` hook, a lint-staged config, or a workflow. Your own `eslint.config.js` is never edited, and what it imports stays.
- **A peer dependency.** If another installed package requires it as a (non-optional) peer, it stays.
- **`eslint` under pnpm or Yarn Plug'n'Play.** Those do not expose the plugin's copy to your editor or a plain `eslint .`.
- **Legacy config with rules or settings of its own.** Only `eslint:recommended`, Node and ES environments, and module syntax count as nothing. Rules, plugins, other globals, other `extends`, unparseable files, and `.eslintignore` patterns beyond `node_modules`, `dist`, `bin`, `.yarn`, and `.opx` are yours, so the file stays and you are told to move them into `eslint.config.js`.
- **Legacy config an older ESLint still reads.** If you declare `eslint` below version 9, it stays.
- **Files with uncommitted changes, or untracked files.** Only files unchanged since `HEAD` are deleted, so git can always restore them.
- **Everything, if git cannot list the project's files.** Without that list there is no way to check for use.

Dependencies are removed with your package manager (`npm uninstall`, `yarn remove`, `pnpm remove`) so the lockfile stays in step. Other `package.json` keys and its indentation are left as they are.

## Non-interactive use

With no TTY, `CI` set, or `OPX_NONINTERACTIVE` set, `init` prints the suggestions and the commands to run instead of prompting. Use [`opx enable`](../enable/) to apply them. It also prints the cleanup candidates and what it would keep, and changes nothing.
