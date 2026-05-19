# @allons-y/opx

The opx engine — a pure library that defines the `Detector` contract, reads `opx.config.json` and `.opx/state.json`, loads detector plugins from the host's `node_modules`, and exposes utilities for resolving package managers, installing hooks, and gitignoring artefacts.

You usually don't depend on this directly. Install [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli) instead — the CLI drives this engine and is what end-users invoke.

This package is the right dependency if you're:

- **Writing a detector** (e.g. `@allons-y/opx-lint-go`) and need the `Detector` and `DetectorContext` types.
- **Building a host** other than the CLI (e.g. an MCP server, a Code Action) on top of opx's detector model.

## Install

```sh
yarn add @allons-y/opx
# or
npm i @allons-y/opx
```

## Public surface

```ts
import type {
  Detector,
  DetectorContext,
  DetectorDescription,
  OpxConfig,
  OpxState,
  Logger,
  PackageJson,
  PackageManager,
} from "@allons-y/opx";

import {
  readConfig,
  writeConfig,
  readState,
  writeState,
  defaultConfig,
  defaultState,
  configPath,
  loadPlugins,
  normalizeDetectorId,
  installCommand,
  installPostCommitHook,
  ensureGitignored,
  defaultSkipUntilDate,
} from "@allons-y/opx";
```

A detector is a small object:

```ts
export const myDetector: Detector = {
  id: "@allons-y/opx-lint-foo",
  shortName: "foo",
  displayName: "Foo (linter)",
  fileTypes: [".foo"],
  detect: (ctx) => ctx.fileTypes.has(".foo"),
  describe: () => ({ summary: "...", bundledDeps: [...] }),
  run: async (ctx, args) => 0,
};
```

## Config schema

The engine ships [`opx.schema.json`](https://unpkg.com/@allons-y/opx/opx.schema.json), the JSON Schema for `opx.config.json`. Reference it via `$schema` for editor validation.

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by [Allons-y Studio](https://allons-y.llc) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
