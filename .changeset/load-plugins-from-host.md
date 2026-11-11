---
"@allons-y/opx": minor
"@allons-y/opx-cli": patch
---

opx now loads plugins from your project's `node_modules`, so a global or `npx` install of opx finds the plugins your project installs. Before, it looked next to its own install and reported "no linters are detected".

`opx lint`, `opx build`, and `opx release` now exit 1 when an enabled plugin isn't installed or fails to import, and say why on stderr, instead of passing without running it. They still run the plugins that loaded.

For plugin hosts, `loadPlugins` takes an optional `onSkip(entry, reason)` callback, and the engine exports `resolvePackageEntry` and `packageEntry`.
