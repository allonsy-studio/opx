# @allons-y/opx-lint-js

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
