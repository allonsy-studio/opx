# @allons-y/opx-lint-js

## 1.0.0-beta.3

### Minor Changes

- 3156649: The default config now enforces modern JavaScript syntax, so projects no longer re-declare these rules.

  - Added as `error`: `no-var`, `prefer-const`, `prefer-arrow-callback`, `prefer-template`, `prefer-spread`, `prefer-rest-params`, `prefer-object-spread` and `object-shorthand`. `lint-ts` already enables `no-var`, `prefer-const`, `prefer-spread` and `prefer-rest-params` through `typescript-eslint`.
  - `no-unused-vars` now sets `ignoreRestSiblings: true`.
  - Added the `@stylistic` rules `template-curly-spacing` (`never`) and `object-curly-spacing` (`always`), so the `prefer-template` and `prefer-object-spread` fixes produce tidy output.
  - `no-console` stays opt-in.
  - Existing code may now report errors. Run `opx lint --fix` to apply the automatic fixes; `prefer-rest-params` and some `prefer-spread` cases need a manual edit.

## 1.0.0-beta.2

### Minor Changes

- 0530ab0: Plugins now document what project files and settings are duplicative, and `opx init --cleanup` surfaces the suggestions.

  - `@allons-y/opx`: add the optional `cleanup(ctx)` hook to `Detector`, the `CleanupSuggestion` and `SuggestionCommand` types, and `uninstallCommand`, the counterpart to `installCommand`. A suggestion can carry a `command` that opx prints and never runs.
  - `@allons-y/opx-lint-js`, `-json`, `-md`, `-ts`: suggest the packages they bundle (such as `eslint` and `globals`) with the version each plugin ships, and the legacy ESLint config that flat config replaces (`.eslintrc*`, `.eslintignore`, `eslintConfig`, `eslintIgnore`). Each plugin now pins the tools it ships to exact versions, so that version is the one users get. The advice follows a `lint.<name>` override, and an `.eslintrc*` file gets an `@eslint/migrate-config` command unless a flat config exists, because that command overwrites one.
  - `@allons-y/opx-cli`: `opx init --cleanup` prints each enabled plugin's suggestions. Cleanup is opt-in, because it can delete files. It deletes only a suggested file that is empty and unchanged in git, after you confirm. Packages and `package.json` keys are advice only, with the `remove` command and any plugin command printed for you. Packages the project still uses are kept. `init --auto` never runs cleanup.

### Patch Changes

- 5815e3c: List `types` first in `exports["."]`, as TypeScript requires: it matches conditions in order, so `types` must come before `import`. The type declarations already resolved because they sit beside the JavaScript, but `publint` flagged the order as an error. The build now runs `publint` and `attw` on every packed package.
- Updated dependencies [5815e3c]
- Updated dependencies [0530ab0]
- Updated dependencies [5815e3c]
  - @allons-y/opx@0.1.0-beta.2

## 1.0.0-beta.1

### Major Changes

- 896dfe8: `@allons-y/opx-lint-js` now lints JavaScript only, so a JS project no longer needs `typescript`.

  - Breaking: `@allons-y/opx-lint-js` no longer lints `.ts`, `.tsx`, `.mts` or `.cts` files. It drops `typescript-eslint` and the `typescript` peer dependency, which removes the Yarn "doesn't provide typescript" warning. TypeScript linting will move to a separate `@allons-y/opx-lint-ts` package.
  - `@allons-y/opx-cli` no longer suggests the `js` plugin for `.ts` and `.tsx` files.

### Minor Changes

- b1e595a: opx is now licensed under Apache-2.0. The license adds an express patent grant and clear terms for commercial use, so adopting the toolkit in a company project needs no extra legal review of MPL file-level copyleft. The `license` field in every published package and the `LICENSE` file shipped with each now match.

### Patch Changes

- 9964328: Faster startup and one shared lint runner source.

  - `@allons-y/opx` runs the post-commit hook through `node_modules/.bin` on `PATH` instead of `npx`, which took about a second to start. The installer also inserts that line above a trailing `exit` in an existing hook, where it used to append after it and never run.
  - `@allons-y/opx-cli` loads only the command being run and reads `fileTypes` and `branch` from git on first use, so `lint`, `release`, and `hook` skip those git calls.
  - The lint plugins share one runner source that is copied into each package only when it is packed, so the engine stays free of any specific tool and each plugin can opt out.
  - `@allons-y/opx-release` reads `.env` with `process.loadEnvFile()` and drops the `dotenv` dependency.

- Updated dependencies [b1e595a]
- Updated dependencies [9964328]
  - @allons-y/opx@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- e30e06d: Initial release of the opx toolkit: a tiny `opx` CLI plus installable detector
  plugins for linting (JS/TS, JSON, Markdown), building, and changesets-based
  releases. Includes the detector engine and contract, `.opx/config.json`
  configuration, parallel grouped/colored lint output, composable ESLint configs,
  and a full test suite.

### Patch Changes

- Updated dependencies [e30e06d]
  - @allons-y/opx@0.1.0-beta.0
