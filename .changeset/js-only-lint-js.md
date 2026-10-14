---
"@allons-y/opx-lint-js": major
"@allons-y/opx-cli": patch
---

`@allons-y/opx-lint-js` now lints JavaScript only, so a JS project no longer needs `typescript`.

- Breaking: `@allons-y/opx-lint-js` no longer lints `.ts`, `.tsx`, `.mts` or `.cts` files. It drops `typescript-eslint` and the `typescript` peer dependency, which removes the Yarn "doesn't provide typescript" warning. TypeScript linting will move to a separate `@allons-y/opx-lint-ts` package.
- `@allons-y/opx-cli` no longer suggests the `js` plugin for `.ts` and `.tsx` files.
