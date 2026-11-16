---
layout: layouts/docs.njk
title: opx hook
description: Internal command invoked by the git hooks opx installs.
eleventyNavigation:
    parent: CLI
    key: opx hook
    order: 8
---

Internal. Invoked by the hooks that [`opx init`](../init/) and [`opx enable`](../enable/) install.

```sh
opx hook post-commit
opx hook <name> [args...]
```

## post-commit

Looks at the files in the latest commit. For each new file type that a known plugin could handle, it prints a one-line suggestion to run `opx enable <name>`. Plugins you've already enabled, and ones you answered "later" for on the current branch, are skipped.

The hook runs in the background and always exits `0`, so it never blocks or slows a commit.

## Plugin hooks

`opx hook <name>` runs every enabled plugin that [declared](../../guides/writing-a-detector/#installing-git-hooks) the git hook `<name>`, such as `commit-msg` or `pre-push`. Each plugin gets git's arguments and runs in the order the plugins load. Every plugin runs even after one fails.

- **Exit code:** the first failing plugin's code, or `0`. A plugin that throws counts as failed and is named on stderr, without a stack trace.
- **Blocking:** whether that code stops the commit or push depends on how the plugin declared the hook. A non-blocking hook runs in the background and never blocks.
- **Broken config:** if `.opx/config.json` can't be read, opx prints a `▲` warning on stderr and exits `0`, so a bad config never locks up git.
- **No plugin declared it:** nothing runs and it exits `0`.
