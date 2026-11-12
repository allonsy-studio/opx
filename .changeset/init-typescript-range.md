---
"@allons-y/opx-cli": minor
---

**Breaking:** the CLI no longer keeps its own list of what a plugin needs from your project. A plugin's `peerDependencies` are now the single source of truth, and `opx init` installs from them.

**Why.** `opx init` installed a bare `typescript` with `@allons-y/opx-lint-ts`. A prerelease CLI pinned it to the `beta` dist-tag, which is TypeScript 7, and lint-ts can't load that (`typescript-eslint` needs the programmatic API TypeScript 7 doesn't ship). `typescript@latest` is TypeScript 7 too, so dropping the tag didn't help, and `opx init --yes` and `--accept ts` never installed `typescript` at all. A range copied into the CLI's catalog would have fixed today's case, but it would live in two places, and every plugin release that changes its supported range would need a matching CLI release. Reading the range from the plugin removes that coupling: supporting TypeScript 7 later is a lint-ts release and nothing else, and a third-party plugin's peers work the same way, with no catalog entry.

**What changed**

- npm, pnpm, and bun install a plugin's peers with the plugin, within its declared range, so `opx init` runs one install.
- Yarn only warns about a missing peer. After the plugin installs, opx reads its `peerDependencies` and installs the ones your project lacks, using the plugin's own range. It skips optional peers and any peer you already list.
- This applies to `opx init`, `opx init --yes`, and `opx init --accept`. The range stays off the prerelease dist-tag.
- opx never changes a version your project already uses. If a peer you already have is outside what the plugin supports (TypeScript 7 where lint-ts supports 5 and 6), `opx init` warns, naming both, and leaves it alone.
- If opx can't read the installed plugin to find its peers (Yarn Plug'n'Play, for one), it says which plugin and tells you to install the packages under its `peerDependencies`.
- `opx scan` and the `opx init` prompt no longer say "Requires typescript", and the `opx init --report` hint is `install @allons-y/opx-lint-ts, then run opx enable ts`.

**Migrating**

- `opx scan --json`: `suggestions[].requires` is gone. If you read it, read the plugin's `peerDependencies` instead. `install` lists the plugin only.
- Scripts that ran `opx init` and expected `typescript` to be installed by the CLI itself now get it from the package manager (npm, pnpm, bun) or from opx's second install step (Yarn). Nothing to change unless you parsed the install command.
- A peer that npm, pnpm, or bun installs for you isn't added to your `package.json`, and pnpm doesn't link it at the top level. If your own code or scripts use `typescript`, add it yourself.
