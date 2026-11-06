---
"@allons-y/opx-cli": minor
---

`opx scan`, `opx init`, `opx enable` and the post-commit hook now know about `@allons-y/opx-lint-ts`, and fit it into projects that already use opx.

- A tree with `.ts`, `.tsx`, `.mts` or `.cts` files gets a `ts` suggestion. Declaration files such as `types.d.ts` count as their own file type, so a JavaScript package that ships hand-written types is not offered lint-ts.
- A newly enabled plugin follows the others in its task. When they all point at the same config file, such as `./eslint.config.js`, `opx init` and `opx enable` point the new one there too, instead of writing `true`.
- `opx enable` no longer replaces a plugin's config path with `true` when the plugin is enabled again.
- When the project has its own `eslint.config.js`, `opx init` and `opx enable` print the import & spread lines it still needs. opx never edits that file. A new project still gets a scaffolded `eslint.config.js` that includes lint-ts.
- `@allons-y/opx-lint-js` 0.x also lints TypeScript, and npm's `latest` tag still points at it. Accepting `ts` in `opx init` now installs lint-js from its JavaScript-only `^1.0.0-beta.1` range, or upgrades a 0.x release already installed. `opx enable ts` prints that upgrade command. Either way, `.ts` files are no longer linted twice.
