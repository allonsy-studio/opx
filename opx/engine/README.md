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
  installHook,
  removeHook,
  hookLine,
  planHooks,
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

### Git hooks

A detector can declare git hooks with `hooks`, a map from hook name to `{ args, blocking? }`. `args` are the `opx` arguments the hook runs, normally `["hook", "<name>"]`, and `blocking: true` makes a failure stop the commit or push:

```ts
hooks: { "commit-msg": { args: ["hook", "commit-msg"], blocking: true } },
```

Hosts install them with `installHook(cwd, name, line)`, where `line` comes from `hookLine(args, blocking)`, and take them out with `removeHook`. `planHooks(detectors)` merges what several detectors declare into one line per hook. `installHook` appends to an existing husky hook above a trailing `exit`, upgrades lines earlier versions wrote, and leaves the hook alone when the line is already there. `removeHook` removes only a line opx wrote. The command is Plug'n'Play aware: it runs `yarn opx …` when `.pnp.cjs` exists and `node_modules/.bin/opx` otherwise. During `opx hook <name>`, `ctx.hook` holds the hook's name.

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
