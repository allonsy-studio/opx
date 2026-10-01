---
layout: layouts/docs.njk
title: opx build
description: Run every enabled builder.
eleventyNavigation:
    parent: CLI
    key: opx build
    order: 6
---

Run every enabled build plugin.

## Synopsis

```sh
opx build [paths...]
```

Works like [`opx lint`](../lint/) for the `build` task. There are no official build plugins yet, so with none enabled it prints a hint and exits `0`. Third-party plugins can provide one by exporting a detector with `concern: "build"`; see [Writing a detector](../../guides/writing-a-detector/).
