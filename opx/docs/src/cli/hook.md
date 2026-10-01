---
layout: layouts/docs.njk
title: opx hook
description: Internal command invoked by the git post-commit hook.
eleventyNavigation:
    parent: CLI
    key: opx hook
    order: 8
---

Internal. Invoked by the hook that [`opx init`](../init/) installs.

```sh
opx hook post-commit
```

Looks at the files in the latest commit. For each new file type that a known plugin could handle, it prints a one-line suggestion to run `opx enable <name>`. Plugins you've already enabled, and ones you answered "later" for on the current branch, are skipped.

The hook runs in the background and always exits `0`, so it never blocks or slows a commit.
