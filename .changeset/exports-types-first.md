---
"@allons-y/opx-lint-js": patch
"@allons-y/opx-lint-json": patch
"@allons-y/opx-lint-md": patch
"@allons-y/opx-lint-ts": patch
"@allons-y/opx-release": patch
---

List `types` first in `exports["."]`, as TypeScript requires: it matches conditions in order, so `types` must come before `import`. The type declarations already resolved because they sit beside the JavaScript, but `publint` flagged the order as an error. The build now runs `publint` and `attw` on every packed package.
