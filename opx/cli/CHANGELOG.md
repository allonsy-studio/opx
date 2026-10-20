# @allons-y/opx-cli

## 0.1.0-beta.2

### Minor Changes

- 5815e3c: opx now detects Bun, and `opx init` no longer guesses when the package manager is unclear.

  - `@allons-y/opx`: add `bun` to `PackageManager` and to `installCommand` and `uninstallCommand`. Add `inspectPackageManager`, which also reports whether the answer is certain, whether the project is a workspace root, and whether it uses Yarn Classic. The order is now the `packageManager` field, then lockfiles, then the launching manager (`npm_config_user_agent`), then `npm`. It looks up to the repository root, so a workspace member finds the root's lockfile. `installCommand` takes `workspaceRoot` and `yarnClassic` options, adding `-w` for pnpm and `-W` for Yarn Classic at a workspace root, which pnpm 9 and earlier and Yarn Classic refuse to run without.
  - `@allons-y/opx-cli`: `opx init` installs with the detected manager, including Bun. When the `packageManager` field and a lockfile disagree, or several lockfiles exist, it prints the install command and what conflicts instead of running it.

- 0530ab0: Plugins now document what project files and settings are duplicative, and `opx init --cleanup` surfaces the suggestions.

  - `@allons-y/opx`: add the optional `cleanup(ctx)` hook to `Detector`, the `CleanupSuggestion` and `SuggestionCommand` types, and `uninstallCommand`, the counterpart to `installCommand`. A suggestion can carry a `command` that opx prints and never runs.
  - `@allons-y/opx-lint-js`, `-json`, `-md`, `-ts`: suggest the packages they bundle (such as `eslint` and `globals`) with the version each plugin ships, and the legacy ESLint config that flat config replaces (`.eslintrc*`, `.eslintignore`, `eslintConfig`, `eslintIgnore`). Each plugin now pins the tools it ships to exact versions, so that version is the one users get. The advice follows a `lint.<name>` override, and an `.eslintrc*` file gets an `@eslint/migrate-config` command unless a flat config exists, because that command overwrites one.
  - `@allons-y/opx-cli`: `opx init --cleanup` prints each enabled plugin's suggestions. Cleanup is opt-in, because it can delete files. It deletes only a suggested file that is empty and unchanged in git, after you confirm. Packages and `package.json` keys are advice only, with the `remove` command and any plugin command printed for you. Packages the project still uses are kept. `init --auto` never runs cleanup.

### Patch Changes

- Updated dependencies [5815e3c]
- Updated dependencies [0530ab0]
- Updated dependencies [5815e3c]
  - @allons-y/opx@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- b1e595a: opx is now licensed under Apache-2.0. The license adds an express patent grant and clear terms for commercial use, so adopting the toolkit in a company project needs no extra legal review of MPL file-level copyleft. The `license` field in every published package and the `LICENSE` file shipped with each now match.

### Patch Changes

- 896dfe8: `@allons-y/opx-lint-js` now lints JavaScript only, so a JS project no longer needs `typescript`.

  - Breaking: `@allons-y/opx-lint-js` no longer lints `.ts`, `.tsx`, `.mts` or `.cts` files. It drops `typescript-eslint` and the `typescript` peer dependency, which removes the Yarn "doesn't provide typescript" warning. TypeScript linting will move to a separate `@allons-y/opx-lint-ts` package.
  - `@allons-y/opx-cli` no longer suggests the `js` plugin for `.ts` and `.tsx` files.

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
