---
"@allons-y/opx-cli": minor
"@allons-y/opx": minor
"@allons-y/opx-lint-js": minor
"@allons-y/opx-lint-json": minor
"@allons-y/opx-lint-md": minor
"@allons-y/opx-lint-ts": minor
---

Plugins now document what project files and settings are duplicative, and `opx init --cleanup` surfaces the suggestions.

- `@allons-y/opx`: add the optional `cleanup(ctx)` hook to `Detector`, the `CleanupSuggestion` and `SuggestionCommand` types, and `uninstallCommand`, the counterpart to `installCommand`. A suggestion can carry a `command` that opx prints and never runs.
- `@allons-y/opx-lint-js`, `-json`, `-md`, `-ts`: suggest the packages they bundle (such as `eslint` and `globals`) with the version each plugin ships, and the legacy ESLint config that flat config replaces (`.eslintrc*`, `.eslintignore`, `eslintConfig`, `eslintIgnore`). Each plugin now pins the tools it ships to exact versions, so that version is the one users get. The advice follows a `lint.<name>` override, and an `.eslintrc*` file gets an `@eslint/migrate-config` command unless a flat config exists, because that command overwrites one.
- `@allons-y/opx-cli`: `opx init --cleanup` prints each enabled plugin's suggestions. Cleanup is opt-in, because it can delete files. It deletes only a suggested file that is empty and unchanged in git, after you confirm. Packages and `package.json` keys are advice only, with the `remove` command and any plugin command printed for you. Packages the project still uses are kept. `init --auto` never runs cleanup.
