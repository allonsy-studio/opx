# @allons-y/opx

## 0.1.0-beta.5

### Minor Changes

- 7e063f9: opx now loads plugins from your project's `node_modules`, so a global or `npx` install of opx finds the plugins your project installs. Before, it looked next to its own install and reported "no linters are detected".

  `opx lint`, `opx build`, and `opx release` now exit 1 when an enabled plugin isn't installed or fails to import, and say why on stderr, instead of passing without running it. They still run the plugins that loaded.

  For plugin hosts, `loadPlugins` takes an optional `onSkip(entry, reason)` callback, and the engine exports `resolvePackageEntry` and `packageEntry`.

### Patch Changes

- 3615815: opx works in Yarn Plug'n'Play projects:

  - The lint plugins no longer lint the `.pnp.cjs` and `.pnp.loader.mjs` files Yarn generates.
  - The post-commit hook runs opx through `yarn` when the project uses Plug'n'Play, which has no `node_modules/.bin`. Before, it found no opx and silently did nothing. Running `opx init` again upgrades a hook an earlier version installed.

## 0.1.0-beta.4

### Minor Changes

- 764ad1b: Saving `.opx/config.json` now warns when it leaves out a top-level key opx doesn't know. `opx enable`, `opx disable`, and `opx init` name the removed keys instead of dropping them silently. `writeConfig` returns the keys it left out, and the engine exports `CONFIG_KEYS`, the keys it keeps.

### Patch Changes

- 07965b1: The `DynamicTaskConfig` type now allows a string for a plugin setting, a path to that plugin's config file, as `.opx/config.json`'s schema and the lint runners already did.

## 0.1.0-beta.3

### Minor Changes

- 5f69b0b: `release` and `test` in `.opx/config.json` can hold settings instead of `true`; settings turn the task on. `opx init`, `opx scan`, and `opx enable` keep the settings, and the new `isTaskEnabled` export tells whether a task is on.

### Patch Changes

- b65e160: `.opx/config.json` stays committable when `.gitignore` already had opx entries in the wrong order or a line hiding the whole `.opx` folder. opx now drops those lines and writes `.opx/*` followed by `!.opx/config.json`.

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

- 5815e3c: Make the declaration files self-contained. `resolveTool`, `detectPackageManager` and `inspectPackageManager` no longer use the `NodeJS` global from `@types/node` in their types, so a TypeScript project can read them without installing `@types/node`. They are checked on TypeScript 5 and 6.

## 0.1.0-beta.1

### Minor Changes

- b1e595a: opx is now licensed under Apache-2.0. The license adds an express patent grant and clear terms for commercial use, so adopting the toolkit in a company project needs no extra legal review of MPL file-level copyleft. The `license` field in every published package and the `LICENSE` file shipped with each now match.

### Patch Changes

- 9964328: Faster startup and one shared lint runner source.

  - `@allons-y/opx` runs the post-commit hook through `node_modules/.bin` on `PATH` instead of `npx`, which took about a second to start. The installer also inserts that line above a trailing `exit` in an existing hook, where it used to append after it and never run.
  - `@allons-y/opx-cli` loads only the command being run and reads `fileTypes` and `branch` from git on first use, so `lint`, `release`, and `hook` skip those git calls.
  - The lint plugins share one runner source that is copied into each package only when it is packed, so the engine stays free of any specific tool and each plugin can opt out.
  - `@allons-y/opx-release` reads `.env` with `process.loadEnvFile()` and drops the `dotenv` dependency.

## 0.1.0-beta.0

### Minor Changes

- e30e06d: Initial release of the opx toolkit: a tiny `opx` CLI plus installable detector
  plugins for linting (JS/TS, JSON, Markdown), building, and changesets-based
  releases. Includes the detector engine and contract, `.opx/config.json`
  configuration, parallel grouped/colored lint output, composable ESLint configs,
  and a full test suite.
