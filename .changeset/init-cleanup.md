---
"@allons-y/opx-cli": minor
"@allons-y/opx": minor
---

`opx init` can now clean up what your enabled plugins replace.

- `@allons-y/opx-cli`: after setup, `opx init` offers to remove dependencies a plugin bundles (such as `eslint` and `globals`) and legacy ESLint config (`.eslintrc*`, `.eslintignore`, `eslintConfig`, `eslintIgnore`). It keeps anything the project still imports, runs, or needs as a peer, and any config with rules or settings of its own. Non-interactive runs only list the candidates. Pass `--no-cleanup` to skip it.
- `@allons-y/opx`: add `uninstallCommand`, the counterpart to `installCommand`.
