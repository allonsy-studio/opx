# @allons-y/toolkit

Shared lint, format, test, and release tooling for `@allons-y` GitHub Action repos. One install, one source of truth for ESLint, Prettier, commitlint, Jest, semantic-release, and TypeScript base config.

## Install

```sh
yarn add --dev @allons-y/toolkit eslint prettier jest semantic-release typescript
# TS-using consumers also:
yarn add --dev ts-jest
```

`typescript` is required even for JS-only consumers because the toolkit's ESLint flat config loads `typescript-eslint` (which transitively needs `typescript`) at config-load time regardless of which files actually match. If you don't want that, fork the ESLint config or send a PR to add a JS-only subpath export.

## Use

Every consumer config collapses to a single re-export.

### `eslint.config.js`

```js
export { default } from "@allons-y/toolkit/eslint";
```

### `prettier.config.js`

```js
export { default } from "@allons-y/toolkit/prettier";
```

### `commitlint.config.js`

```js
export { default } from "@allons-y/toolkit/commitlint";
```

### `jest.config.js` — TypeScript

```js
export { default } from "@allons-y/toolkit/jest";
```

### `jest.config.cjs` — JavaScript-only

```js
module.exports = require("@allons-y/toolkit/jest/js");
```

### `.releaserc.js`

```js
export { default } from "@allons-y/toolkit/semantic-release";
```

Need to override the assets the git plugin commits (e.g. your build emits `dist/index.js`)?

```js
import { createConfig } from "@allons-y/toolkit/semantic-release";
export default createConfig({ gitAssets: ["dist/index.js", "CHANGELOG.md", "package.json", "yarn.lock"] });
```

### `tsconfig.json`

```json
{
	"extends": "@allons-y/toolkit/tsconfig.base.json",
	"compilerOptions": {
		"rootDir": "./src"
	},
	"exclude": ["node_modules", "__mocks__", "src/**/*.test.ts"]
}
```

## What's in scope

- **ESLint** flat config with TypeScript, Jest, JSON (sorted keys), Markdown, and Prettier-disable
- **Prettier** with 800-col width, tabs, space-indented YAML in `.github/`
- **commitlint** with `config-conventional` and no header length cap
- **Jest** with `ts-jest` and 80% coverage threshold; JS-only preset for non-TS consumers
- **semantic-release** pipeline: conventional analyzer, emoji-sectioned notes, changelog, GitHub release, git asset commit, and major-tag force-push
- **TypeScript** base config: ESNext, NodeNext, strict

## Versioning

Major bumps when the consumer must change code (rule changes, dropped exports, peer dep major). Minor for added exports or new rule coverage. Patch for fixes.
