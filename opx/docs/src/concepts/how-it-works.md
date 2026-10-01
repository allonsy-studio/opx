---
layout: layouts/docs.njk
title: How opx works
description: Scanning, detectors, tasks, and how plugins are loaded.
eleventyNavigation:
    parent: Concepts
    key: How opx works
    order: 1
---

## The flow

1. **Scan.** opx lists the files in your git `HEAD` and collects their extensions.
2. **Match.** Each installed plugin's detector decides whether it applies to that set of file types.
3. **Load.** Only plugins that are both enabled in `.opx/config.json` and installed in your `package.json` are loaded.
4. **Run.** `opx lint` and `opx build` run every loaded detector for that task, in parallel, and combine the exit codes.

Because opx reads the committed tree, untracked and ignored files never influence what it suggests.

## Detectors

A detector is the unit of work. It is a small object with an `id`, a `shortName` (such as `js`), a `concern`, a `detect()` function, and an optional `run()` function that invokes the real tool. See [Writing a detector](../../guides/writing-a-detector/) and the [`Detector` type](../../api/).

## Tasks

The config groups detectors by task.

| Task | Kind | Shape in config | Used by |
| --- | --- | --- | --- |
| `lint` | dynamic | object keyed by plugin short name | `opx lint` |
| `build` | dynamic | object keyed by plugin short name | `opx build` |
| `release` | static | boolean (or a setting) | `opx release` |
| `test` | static | boolean | reserved, no official plugin yet |

## How plugins are found

A short name such as `js` resolves to `@allons-y/opx-lint-js` (or `-build-` for the build task). For other plugins the loader accepts these names:

- `@allons-y/opx-*` for first-party plugins
- `opx-plugin-*` for community plugins
- `@scope/opx-plugin-*` for scoped community plugins

A plugin must appear in your `dependencies` or `devDependencies`. If an enabled plugin isn't installed, opx prints a warning naming the packages it tried and skips it. It never installs anything on its own during `lint` or `build`.

## Local files

All of opx's files live in `.opx/`.

| Path | Purpose | Commit it? |
| --- | --- | --- |
| `.opx/config.json` | Which plugins are enabled | Yes |
| `.opx/state.json` | Last scanned commit and per-branch "later" deferrals | No |
| `.opx/cache/` | Tool caches, such as ESLint's | No |

If `state.json` is missing or unreadable, opx starts from a clean state. An unreadable `config.json` is an error that names the file, because opx won't guess at your settings.

## Trust model

opx runs the tools a project configures, with your privileges. Running `opx lint`, `opx build` or `opx release` in a repository you don't trust therefore runs that repository's code:

- `.opx/config.json` can point a plugin at a config file in the repository, such as an ESLint flat config, and ESLint executes it.
- Plugins installed from the repository's `package.json` are imported and run.
- Those plugins' own dependencies and install scripts run when you install the project.

This is the same as running ESLint, a build, or `npm test` in a cloned repository, and it is by design. `opx scan` only reads the file list from git and runs nothing, and opx never installs a package during `lint` or `build`.

Treat an untrusted repository like any other untrusted code: review it first, or run opx inside a sandbox or CI job that has no secrets. For pull requests from forks, see [Use opx in CI](../../guides/ci/#pull-requests-from-forks).

## The post-commit hook

`opx init` installs a husky `post-commit` hook that runs `opx hook post-commit` in the background. When a commit introduces file types that an uninstalled plugin could handle, it prints a one-line suggestion. It always exits `0` and never blocks a commit.
