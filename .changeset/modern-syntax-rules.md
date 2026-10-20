---
"@allons-y/opx-lint-js": minor
---

The default config now enforces modern JavaScript syntax, so projects no longer re-declare these rules.

- Added as `error`: `no-var`, `prefer-const`, `prefer-arrow-callback`, `prefer-template`, `prefer-spread`, `prefer-rest-params`, `prefer-object-spread` and `object-shorthand`. `lint-ts` already enables `no-var`, `prefer-const`, `prefer-spread` and `prefer-rest-params` through `typescript-eslint`.
- `no-unused-vars` now sets `ignoreRestSiblings: true`.
- Added the `@stylistic` rules `template-curly-spacing` (`never`) and `object-curly-spacing` (`always`), so the `prefer-template` and `prefer-object-spread` fixes produce tidy output.
- `no-console` stays opt-in.
- Existing code may now report errors. Run `opx lint --fix` to apply the automatic fixes; `prefer-rest-params` and some `prefer-spread` cases need a manual edit.
