---
"@allons-y/opx": patch
"@allons-y/opx-cli": patch
"@allons-y/opx-lint-js": patch
"@allons-y/opx-lint-json": patch
"@allons-y/opx-lint-md": patch
"@allons-y/opx-release": patch
---

Faster startup, one shared lint runner source, and a lighter install.

- `@allons-y/opx` runs the post-commit hook through `node_modules/.bin` on `PATH` instead of `npx`, which took about a second to start. The installer also inserts that line above a trailing `exit` in an existing hook, where it used to append after it and never run.
- `@allons-y/opx-cli` loads only the command being run and reads `fileTypes` and `branch` from git on first use, so `lint`, `release`, and `hook` skip those git calls.
- The lint plugins share one runner source that is copied into each package at build time, so the engine stays free of any specific tool and each plugin can opt out.
- `@allons-y/opx-release` reads `.env` with `process.loadEnvFile()` and drops the `dotenv` dependency.
