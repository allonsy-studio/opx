---
"@allons-y/opx": minor
"@allons-y/opx-cli": patch
"@allons-y/opx-lint-js": patch
"@allons-y/opx-lint-json": patch
"@allons-y/opx-lint-md": patch
"@allons-y/opx-release": patch
---

Faster startup, one shared lint runner, and a lighter install.

- `@allons-y/opx` adds `runEslint`, the runner the lint plugins now share, and removes the unused `resolveTool` and `ResolvedTool` exports. The post-commit hook runs `node_modules/.bin/opx` when it exists and falls back to `npx`, which took about a second to start.
- `@allons-y/opx-cli` loads only the command being run and reads `fileTypes` and `branch` from git on first use, so `lint`, `release`, and `hook` skip those git calls.
- The lint plugins delegate to the shared runner with no change in behavior.
- `@allons-y/opx-release` reads `.env` with `process.loadEnvFile()` and drops the `dotenv` dependency.
