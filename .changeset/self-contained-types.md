---
"@allons-y/opx": patch
---

Make the declaration files self-contained. `resolveTool`, `detectPackageManager` and `inspectPackageManager` no longer use the `NodeJS` global from `@types/node` in their types, so a TypeScript project can read them without installing `@types/node`. They are checked on TypeScript 5 and 6.
