# @allons-y/opx-lint-ts

## 0.1.0-beta.1

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

## 0.1.0-beta.0

### Minor Changes

- cb7abea: Add `@allons-y/opx-lint-ts`, the lint detector for TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`). It bundles ESLint, `typescript-eslint`, and `@stylistic/eslint-plugin`, and requires `typescript` as a peer dependency. Enable it with `"ts": true` under `lint` in `.opx/config.json`.

### Patch Changes

- Updated dependencies [b1e595a]
- Updated dependencies [9964328]
  - @allons-y/opx@0.1.0-beta.1
