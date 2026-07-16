<!-- weaver:header:START -->
# opx

<!-- weaver:header:END -->

**opx** is the _optionally_ opinionated front-end toolkit — a tiny CLI plus a
family of installable detector plugins for linting, building, and releasing.
This is the private monorepo root for the `@allons-y/opx-*` packages.

The core idea: the CLI stays tiny and knows nothing about ESLint, changesets, or
any specific tool. It scans your repository, figures out which languages and
workflows are present, and loads the matching detector packages from your own
`node_modules` — only the ones you've chosen to install. You opt into as much
opinion as you want.

## Packages

| Package | Description |
|---|---|
| [`@allons-y/opx-cli`](opx/cli) | The `opx` binary. Scans the tree, suggests tooling, and drives the detectors. Start here. |
| [`@allons-y/opx`](opx/engine) | The engine — the `Detector` contract, config/state handling, and the plugin loader. Depend on this only to write a detector or build a host. |
| [`@allons-y/opx-lint-js`](opx/lint-js) | Lint detector for JavaScript / TypeScript (ESLint + `@stylistic` + `typescript-eslint`). |
| [`@allons-y/opx-lint-json`](opx/lint-json) | Lint detector for JSON / JSONC / JSON5. |
| [`@allons-y/opx-lint-md`](opx/lint-md) | Lint detector for Markdown. |
| [`@allons-y/opx-release`](opx/release) | Release detector — a lightweight [changesets](https://github.com/changesets/changesets) setup and flow. |

## Quick start

Install the CLI (it's tiny — detector packages are loaded on demand, not
pre-installed):

```sh
yarn add --dev @allons-y/opx-cli
```

Then scan and wire up tooling interactively:

```sh
yarn opx init
```

`opx init` inspects your committed tree, suggests the detectors that match
(e.g. `@allons-y/opx-lint-js` for a JS/TS repo), installs the ones you accept,
writes a starter `.opx/config.json`, and offers to add a `lint` script and a
post-commit hook.

## Commands

| Command | What it does |
|---|---|
| `opx scan` | Report which detectors would activate for the committed tree. |
| `opx init` | Interactive setup: pick detectors, install packages, wire scripts and hooks. |
| `opx enable <name>` | Enable a detector by short name (`js`, `json`, `md`, …) or package id. |
| `opx disable <name>` | Disable a detector. |
| `opx lint [paths…]` | Run every enabled lint detector. |
| `opx build [paths…]` | Run every enabled build detector. |
| `opx release [args…]` | Drive the release flow; forwards subcommands to changesets. |
| `opx hook` | Internal — invoked by the post-commit git hook. |

Run `opx <command> --help` for per-command flags. `opx lint --fix` auto-fixes
where the underlying tool supports it.

## Configuration

`opx init` writes an
[`.opx/config.json`](https://unpkg.com/@allons-y/opx/schema/config.json) at the
repo root. Each concern enables one or more plugins by short name. The dynamic
tasks (`lint`, `build`) are keyed objects; the static tasks (`release`, `test`)
are booleans:

```json
{
  "$schema": "https://unpkg.com/@allons-y/opx/schema/config.json",
  "version": 1,
  "lint": { "js": true, "json": true, "md": true },
  "release": true,
  "test": false
}
```

A plugin value may also be a path to a custom config file or an inline config
object instead of `true`.

## Composing lint configs (mix and match)

`opx lint` runs each enabled lint detector as its own scoped ESLint pass, so it
needs no root config. But your **editor** and a plain `eslint .` do want a
single `eslint.config.js`. Because every opx lint package exports its flat
config as a plain array, you compose them by spreading:

```js
// eslint.config.js
import js from "@allons-y/opx-lint-js/eslint.config.js";
import json from "@allons-y/opx-lint-json/eslint.config.js";
import md from "@allons-y/opx-lint-md/eslint.config.js";

export default [
	...js,
	...json,
	...md,
];
```

`opx init` scaffolds exactly this file from the detectors you enable (and never
overwrites an existing one), so editor results match `opx lint`.

Every rule block in these configs is scoped with `files`, so they don't collide
— the JS/TS formatting rules never touch your `.json` or `.md` files. That same
property lets you **mix in third-party configs and plugins**. Flat config is
just an array evaluated top-to-bottom (last match wins), so append your own:

```js
import js from "@allons-y/opx-lint-js/eslint.config.js";
import json from "@allons-y/opx-lint-json/eslint.config.js";
import react from "eslint-plugin-react";

export default [
	// opx's opinions first…
	...js,
	...json,

	// …then a third-party plugin on top of the JS rules…
	{
		files: ["**/*.{jsx,tsx}"],
		plugins: { react },
		rules: react.configs.recommended.rules,
	},

	// …and your own project overrides last (they win).
	{
		files: ["**/*.test.ts"],
		rules: { "@stylistic/quotes": "off" },
	},
];
```

You can also pick and choose: spread only `@allons-y/opx-lint-js` and bring your
own JSON/Markdown configs, or drop opx's lint packages entirely from
`eslint.config.js` while still using `opx build`/`opx release`. The detectors,
the config exports, and your own rules are all independent — use as much or as
little as fits.

> **Tip:** keep opx's configs near the top and your overrides near the bottom.
> ESLint's flat-config cascade applies later matching entries last, so your
> project rules take precedence over opx's defaults.

## Writing a detector

A detector is a small package whose default export implements the `Detector`
contract from `@allons-y/opx`. Name it `@scope/opx-plugin-<name>` (or
`@allons-y/opx-<name>` for first-party plugins) so the loader can resolve it,
and the CLI will pick it up once it's installed and enabled. See
[`@allons-y/opx`](opx/engine) for the types and
[`@allons-y/opx-lint-js`](opx/lint-js) for a reference implementation.

## Development

This repo is a Yarn (v4) workspaces monorepo on Node 24.

```sh
yarn install
yarn build       # build every package
yarn lint        # lint with opx itself (dogfooded)
yarn test        # run the test suites
yarn typecheck   # type-check every package
```


<!-- weaver:contribution:START -->
<!-- weaver:contribution:END -->

<!-- weaver:license:START -->
<!-- weaver:license:END -->

<!-- weaver:funding:START -->
<!-- weaver:funding:END -->

