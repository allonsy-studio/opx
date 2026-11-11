# @allons-y/opx-cli

## 0.1.0-beta.4

### Minor Changes

- 07965b1: `opx init` and `opx enable` now fit `@allons-y/opx-lint-ts` into projects that already use opx.

  - A newly enabled plugin follows the others in its task. When they all point at the same config file, such as `./eslint.config.js`, `opx init` (with or without `--yes`) and `opx enable` point the new one there too, instead of writing `true`.
  - `opx enable` no longer replaces a plugin's config path with `true` when the plugin is enabled again.
  - When the project has its own `eslint.config.js`, `opx init` and `opx enable` print the import & spread lines it still needs. opx never edits that file. A new project still gets a scaffolded `eslint.config.js` that includes lint-ts.
  - `@allons-y/opx-lint-js` 0.x also lints TypeScript. Accepting `ts` in `opx init` installs lint-js from its JavaScript-only `^1.0.0-beta.1` range, or upgrades a 0.x release already installed, and `opx enable ts` prints that upgrade command, so `.ts` files are no longer linted twice. Installing from a dist-tag keeps that range instead of adding the tag to it.
  - Declaration files such as `types.d.ts` count as their own file type, so a JavaScript package that ships hand-written types is not offered lint-ts.

- 9abc31b: Set up opx with one command and no prompts, so scripts and AI agents can adopt it.

  - `opx init --yes` accepts every plugin your files match; `--accept js,md,release` names them, including `release`, which files can't imply. Both install packages, write the config, scaffold `eslint.config.js`, add the `lint` script, and install the hook. Unknown names and failed installs exit `1`.
  - `opx scan --json` adds `packageManager`, `install`, and `setup`, the commands that add and enable what's missing.
  - While the CLI is a prerelease, plugins install from its dist-tag (`@beta`). A bare `npm install @allons-y/opx-lint-js` failed because the packages have only prereleases.
  - The `release` suggestion no longer claims it was found in your files.
  - The docs site publishes `llms.txt` and a guide, "Use opx with an AI agent".

### Patch Changes

- bedebaa: `opx scan` and `opx init` now suggest `@allons-y/opx-lint-ts` for TypeScript files, and note that it needs `typescript`. `opx enable ts` works, and `opx enable @allons-y/opx-lint-ts` enables `ts` under `lint` instead of writing the package id to every task. A third-party plugin id is written under the tasks its detectors declare; if opx can't load it, pass `--task`. The `release` suggestion no longer claims it was found in your files.
- 764ad1b: Saving `.opx/config.json` now warns when it leaves out a top-level key opx doesn't know. `opx enable`, `opx disable`, and `opx init` name the removed keys instead of dropping them silently. `writeConfig` returns the keys it left out, and the engine exports `CONFIG_KEYS`, the keys it keeps.
- Updated dependencies [07965b1]
- Updated dependencies [764ad1b]
  - @allons-y/opx@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- 9d3a210: The post-commit hook now suggests plugins for the files in a repository's first commit. Before, it found no files in a commit with no parent and stayed quiet.
- 5f69b0b: `release` and `test` in `.opx/config.json` can hold settings instead of `true`; settings turn the task on. `opx init`, `opx scan`, and `opx enable` keep the settings, and the new `isTaskEnabled` export tells whether a task is on.
- d005dcb: Scans now report a `.yarnrc.yml` file as the `yarnrc` type as well as `.yml`. Before, the extension check ran first and the `yarnrc` mapping never matched.
- Updated dependencies [b65e160]
- Updated dependencies [5f69b0b]
  - @allons-y/opx@0.1.0-beta.3

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
