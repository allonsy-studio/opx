---
"@allons-y/opx": patch
"@allons-y/opx-lint-js": patch
"@allons-y/opx-lint-ts": patch
"@allons-y/opx-lint-json": patch
---

opx works in Yarn Plug'n'Play projects:

- The lint plugins no longer lint the `.pnp.cjs` and `.pnp.loader.mjs` files Yarn generates.
- The post-commit hook runs opx through `yarn` when the project uses Plug'n'Play, which has no `node_modules/.bin`. Before, it found no opx and silently did nothing. Running `opx init` again upgrades a hook an earlier version installed.
