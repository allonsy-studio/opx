---
"@allons-y/opx-cli": minor
"@allons-y/opx": minor
---

opx now detects Bun, and `opx init` no longer guesses when the package manager is unclear.

- `@allons-y/opx`: add `bun` to `PackageManager` and to `installCommand` and `uninstallCommand`. Add `inspectPackageManager`, which also reports whether the answer is certain, whether the project is a workspace root, and whether it uses Yarn Classic. The order is now the `packageManager` field, then lockfiles, then the launching manager (`npm_config_user_agent`), then `npm`. It looks up to the repository root, so a workspace member finds the root's lockfile. `installCommand` takes `workspaceRoot` and `yarnClassic` options, adding `-w` for pnpm and `-W` for Yarn Classic at a workspace root, which pnpm 9 and earlier and Yarn Classic refuse to run without.
- `@allons-y/opx-cli`: `opx init` installs with the detected manager, including Bun. When the `packageManager` field and a lockfile disagree, or several lockfiles exist, it prints the install command and what conflicts instead of running it.
