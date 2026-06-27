# @allons-y/opx

The opx engine — a pure library that defines the `Detector` contract, reads `.opx/config.json` and `.opx/state.json`, loads detector plugins from the host's `node_modules`, and exposes utilities for resolving package managers, installing hooks, and gitignoring artefacts.

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

### The runner contract

`run` is where a detector does its work. Two rules keep detectors composable and testable across every host:

1. **Return an exit code — never call `process.exit`.** `0` means success; any non-zero value signals failure. The host owns the single `process.exit` at the edge, so it can run several detectors together and surface the first non-zero code. Returning (instead of exiting) is also what lets a unit test call `run` directly and assert on the result.
2. **Write user-facing output through `ctx.write`, not `console`.** Hosts swap in their own `write` to buffer and group concurrent output (the CLI does this so parallel runs don't interleave). Writing to `ctx.write` means your detector's output lands wherever the host wants it.

Host authors follow the same shape: a command/handler is just a `(ctx, args) => Promise<number>`, and the runtime adapts it to the process boundary. The opx CLI's `plugin-kit` module (`CLI_NAME`, `CommandHandler`, `toAction`) is the reference implementation of this convention.

## Config schema

The engine ships [`schema/config.json`](https://unpkg.com/@allons-y/opx/schema/config.json), the JSON Schema for `.opx/config.json`. Reference it via `$schema` for editor validation.

## Requirements

- Node.js ≥ 24

---

<sub>Built and maintained by ☕︎ [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
