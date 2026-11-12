# @allons-y/opx-release

## 0.1.0

### Minor Changes

- b1e595a: opx is now licensed under Apache-2.0. The license adds an express patent grant and clear terms for commercial use, so adopting the toolkit in a company project needs no extra legal review of MPL file-level copyleft. The `license` field in every published package and the `LICENSE` file shipped with each now match.
- 4db94e5: Offer a more readable, print-friendly changelog format as an opt-in. Run `opx release init --changelog` to point `.changeset/config.json` at `@allons-y/opx-release/changelog`, or name it there yourself. Entries lead with the summary, then the PR or commit link, and thank only contributors outside the `maintainers` list, which defaults to the GitHub handles in the root `package.json` `author` and `contributors`. `repo` comes from `package.json` and falls back to `GITHUB_REPOSITORY`. The default generator is unchanged. Projects that copied `changelog.js` into `.changeset/`, or installed `@changesets/changelog-github`, can drop both.
- 5f69b0b: `opx release publish` now runs the whole release: it publishes, tags each new version, pushes the tags, and creates a GitHub release from each version's changelog notes. A repository with an `action.yml` is released as a GitHub Action: the build is committed onto a release-only commit, the version tag points at it, and the major tag (`v1`) moves to it. Every step skips what's already done, so a failed run can be re-run, and each run ends with a summary of every package. Turn steps off with `release` settings in `.opx/config.json` or with `--no-push`, `--no-github-release`, and `--action`/`--no-action`. With `changesets/action`, set `createGithubReleases: false`.

  Messages from every `opx release` command now share one style: a status symbol, the result, and details, with colors and symbols that follow the terminal (`NO_COLOR` and `FORCE_COLOR` work).

- e30e06d: Initial release of the opx toolkit: a tiny `opx` CLI plus installable detector
  plugins for linting (JS/TS, JSON, Markdown), building, and changesets-based
  releases. Includes the detector engine and contract, `.opx/config.json`
  configuration, parallel grouped/colored lint output, composable ESLint configs,
  and a full test suite.
- 4db94e5: The custom changelog reads better and renders cleanly:

  - A `migration:` (or `upgrade:`) line in a changeset becomes a **To upgrade:** paragraph under the entry.
  - Fenced code blocks stay inside their entry, and `#123` inside code is no longer turned into a link.
  - 📝 marks each entry's PR or commit link.
  - Dependency bumps show the old and new versions with a link to the diff between their tags. A single bump takes one line.
  - `releaseDate: true` (or `opx release init --changelog --date`) adds a `📅 _Released 8 November 2026_` line under each new version.

  Summary lines inside fenced code are never read as `pr:`, `commit:`, `author:`, or `migration:` lines, and `#123` in inline code or a URL stays as written. Bots such as Renovate are never thanked. Maintainers come from the workspace root even when a script runs inside a workspace. `init --changelog` keeps options you already set, and `--date` alone opts in. Release dates skip `--snapshot=<name>`, keep CRLF line endings, and join changesets' own commit with `"commit": true`.

- 44bbcf4: `opx release add` now runs changesets' own prompt in a terminal, instead of a copy of it, so `--open`, `--since`, and changesets' package list work as documented. The flag path (`--type`, `--pkg`, `--summary`, `--empty`) stays: it's the one way to record a change without prompting. It now offers the same packages as changesets, so `ignore`d packages are rejected and private packages are allowed when `privatePackages.version` is on. The plugin no longer ships `@clack/prompts`.

### Patch Changes

- 5815e3c: List `types` first in `exports["."]`, as TypeScript requires: it matches conditions in order, so `types` must come before `import`. The type declarations already resolved because they sit beside the JavaScript, but `publint` flagged the order as an error. The build now runs `publint` and `attw` on every packed package.
- 9964328: Faster startup and one shared lint runner source.

  - `@allons-y/opx` runs the post-commit hook through `node_modules/.bin` on `PATH` instead of `npx`, which took about a second to start. The installer also inserts that line above a trailing `exit` in an existing hook, where it used to append after it and never run.
  - `@allons-y/opx-cli` loads only the command being run and reads `fileTypes` and `branch` from git on first use, so `lint`, `release`, and `hook` skip those git calls.
  - The lint plugins share one runner source that is copied into each package only when it is packed, so the engine stays free of any specific tool and each plugin can opt out.
  - `@allons-y/opx-release` reads `.env` with `process.loadEnvFile()` and drops the `dotenv` dependency.

- 0530ab0: Pin the tools the plugin ships to exact versions.
- 9066f36: The starter `.changeset/config.json` now comes from the package's own `config.json`, so the exported file matches what `opx release init` writes. The old export held settings changesets doesn't read (`format`) and paths that don't match a `dist/` build. The `.changeset/README.md` it writes now says when to add a changeset instead of listing commands. The README documents the `changeset`, `version`, and `release` scripts, npm trusted publishing, pre-releases, and snapshot releases.

  The README names the repository's own package manager (`npm run changeset`, `pnpm changeset`, and so on). `opx release add status`, which is what `yarn changeset status` runs, now points to `opx release status` instead of opening the add prompt.

- Updated dependencies [b1e595a]
- Updated dependencies [07965b1]
- Updated dependencies [5815e3c]
- Updated dependencies [0530ab0]
- Updated dependencies [e30e06d]
- Updated dependencies [9964328]
- Updated dependencies [7e063f9]
- Updated dependencies [b65e160]
- Updated dependencies [5f69b0b]
- Updated dependencies [5815e3c]
- Updated dependencies [764ad1b]
- Updated dependencies [3615815]
  - @allons-y/opx@0.1.0

## 0.1.0-beta.3

### Minor Changes

- 4db94e5: Offer a more readable, print-friendly changelog format as an opt-in. Run `opx release init --changelog` to point `.changeset/config.json` at `@allons-y/opx-release/changelog`, or name it there yourself. Entries lead with the summary, then the PR or commit link, and thank only contributors outside the `maintainers` list, which defaults to the GitHub handles in the root `package.json` `author` and `contributors`. `repo` comes from `package.json` and falls back to `GITHUB_REPOSITORY`. The default generator is unchanged. Projects that copied `changelog.js` into `.changeset/`, or installed `@changesets/changelog-github`, can drop both.
- 5f69b0b: `opx release publish` now runs the whole release: it publishes, tags each new version, pushes the tags, and creates a GitHub release from each version's changelog notes. A repository with an `action.yml` is released as a GitHub Action: the build is committed onto a release-only commit, the version tag points at it, and the major tag (`v1`) moves to it. Every step skips what's already done, so a failed run can be re-run, and each run ends with a summary of every package. Turn steps off with `release` settings in `.opx/config.json` or with `--no-push`, `--no-github-release`, and `--action`/`--no-action`. With `changesets/action`, set `createGithubReleases: false`.

  Messages from every `opx release` command now share one style: a status symbol, the result, and details, with colors and symbols that follow the terminal (`NO_COLOR` and `FORCE_COLOR` work).

- 4db94e5: The custom changelog reads better and renders cleanly:

  - A `migration:` (or `upgrade:`) line in a changeset becomes a **To upgrade:** paragraph under the entry.
  - Fenced code blocks stay inside their entry, and `#123` inside code is no longer turned into a link.
  - 📝 marks each entry's PR or commit link.
  - Dependency bumps show the old and new versions with a link to the diff between their tags. A single bump takes one line.
  - `releaseDate: true` (or `opx release init --changelog --date`) adds a `📅 _Released 8 November 2026_` line under each new version.

  Summary lines inside fenced code are never read as `pr:`, `commit:`, `author:`, or `migration:` lines, and `#123` in inline code or a URL stays as written. Bots such as Renovate are never thanked. Maintainers come from the workspace root even when a script runs inside a workspace. `init --changelog` keeps options you already set, and `--date` alone opts in. Release dates skip `--snapshot=<name>`, keep CRLF line endings, and join changesets' own commit with `"commit": true`.

- 44bbcf4: `opx release add` now runs changesets' own prompt in a terminal, instead of a copy of it, so `--open`, `--since`, and changesets' package list work as documented. The flag path (`--type`, `--pkg`, `--summary`, `--empty`) stays: it's the one way to record a change without prompting. It now offers the same packages as changesets, so `ignore`d packages are rejected and private packages are allowed when `privatePackages.version` is on. The plugin no longer ships `@clack/prompts`.

### Patch Changes

- 9066f36: The starter `.changeset/config.json` now comes from the package's own `config.json`, so the exported file matches what `opx release init` writes. The old export held settings changesets doesn't read (`format`) and paths that don't match a `dist/` build. The `.changeset/README.md` it writes now says when to add a changeset instead of listing commands. The README documents the `changeset`, `version`, and `release` scripts, npm trusted publishing, pre-releases, and snapshot releases.

  The README names the repository's own package manager (`npm run changeset`, `pnpm changeset`, and so on). `opx release add status`, which is what `yarn changeset status` runs, now points to `opx release status` instead of opening the add prompt.

- Updated dependencies [b65e160]
- Updated dependencies [5f69b0b]
  - @allons-y/opx@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 5815e3c: List `types` first in `exports["."]`, as TypeScript requires: it matches conditions in order, so `types` must come before `import`. The type declarations already resolved because they sit beside the JavaScript, but `publint` flagged the order as an error. The build now runs `publint` and `attw` on every packed package.
- 0530ab0: Pin the tools the plugin ships to exact versions.
- Updated dependencies [5815e3c]
- Updated dependencies [0530ab0]
- Updated dependencies [5815e3c]
  - @allons-y/opx@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- b1e595a: opx is now licensed under Apache-2.0. The license adds an express patent grant and clear terms for commercial use, so adopting the toolkit in a company project needs no extra legal review of MPL file-level copyleft. The `license` field in every published package and the `LICENSE` file shipped with each now match.

### Patch Changes

- 9964328: Faster startup and one shared lint runner source.

  - `@allons-y/opx` runs the post-commit hook through `node_modules/.bin` on `PATH` instead of `npx`, which took about a second to start. The installer also inserts that line above a trailing `exit` in an existing hook, where it used to append after it and never run.
  - `@allons-y/opx-cli` loads only the command being run and reads `fileTypes` and `branch` from git on first use, so `lint`, `release`, and `hook` skip those git calls.
  - The lint plugins share one runner source that is copied into each package only when it is packed, so the engine stays free of any specific tool and each plugin can opt out.
  - `@allons-y/opx-release` reads `.env` with `process.loadEnvFile()` and drops the `dotenv` dependency.

- Updated dependencies [b1e595a]
- Updated dependencies [9964328]
  - @allons-y/opx@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- e30e06d: Initial release of the opx toolkit: a tiny `opx` CLI plus installable detector
  plugins for linting (JS/TS, JSON, Markdown), building, and changesets-based
  releases. Includes the detector engine and contract, `.opx/config.json`
  configuration, parallel grouped/colored lint output, composable ESLint configs,
  and a full test suite.

### Patch Changes

- Updated dependencies [e30e06d]
  - @allons-y/opx@0.1.0-beta.0
