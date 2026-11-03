---
"@allons-y/opx-cli": minor
---

`opx scan`, `opx init`, and the post-commit hook now know about `@allons-y/opx-lint-ts`. A tree with `.ts`, `.tsx`, `.mts`, or `.cts` files gets a `ts` suggestion, and `opx enable ts` wires up the package. Before this, only the plugin's own package knew it existed, so TypeScript projects were never offered it.

`opx init` also includes `@allons-y/opx-lint-ts/eslint.config.js` in the root `eslint.config.js` it scaffolds, so editors lint TypeScript the same way `opx lint` does.
