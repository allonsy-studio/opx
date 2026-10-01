# Contributing

Thanks for considering a contribution! This project is small and friendly — here's what you need to know.

## Development setup

```sh
nvm use            # Node 24 (see .nvmrc)
corepack enable    # Yarn 4
yarn install
```

opx is a Yarn workspaces monorepo. Each package lives in `opx/<name>`:

| Directory | Package |
| --- | --- |
| `opx/engine` | `@allons-y/opx`: the `Detector` contract, config, state, and plugin loader |
| `opx/cli` | `@allons-y/opx-cli`: the `opx` binary |
| `opx/lint-js`, `opx/lint-json`, `opx/lint-md` | Lint plugins |
| `opx/release` | The changesets release plugin |
| `opx/docs` | The documentation site (private, not published) |

## Common commands

| Command | What it does |
| --- | --- |
| `yarn build` | Bundle every package to its `bin/` directory. |
| `yarn typecheck` | Type-check every package. |
| `yarn test` | Run the Jest test suites. |
| `yarn coverage` | Run tests with coverage. Locally, prints a table. |
| `yarn lint` | Lint the repo with opx itself. |
| `yarn format` | Lint and auto-fix. |
| `yarn smoke` | Pack the packages, install them into a scratch project, and run the CLI. |
| `yarn docs:dev` | Build the docs and serve them with live reload. |
| `yarn docs:build` | Build the docs site. |

## Commit conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint in a git hook.

Releases are managed with [changesets](https://github.com/changesets/changesets). When you make a user-facing change, record it so the version bump and changelog entry are tracked:

```sh
yarn changeset
```

Pick `patch` for bug fixes, `minor` for new features, and `major` for breaking changes. Internal-only changes (refactors, tests, CI, tooling, docs) don't need a changeset.

## Documentation

If you change what a command, option, config key, or plugin does, update its page under `opx/docs/src` in the same pull request. The API reference is generated from the source, so keep JSDoc comments on exported types accurate.

## Pull requests

- Open an issue first for substantive changes — small fixes can skip this.
- Keep PRs focused. One change per PR is easier to review.
- Update tests for any behavior change.
- The CI workflows build the packages, lint, run the full test suite with coverage, and build the docs. Make sure they're green.
- Merging a PR with a changeset into `main` opens a "Version Packages" PR. Merging that PR publishes the updated packages.

## Questions

Stuck on something? Start a thread in [Discussions](https://github.com/allonsy-studio/opx/discussions). The issue tracker is for bugs and feature requests.

## Security

Please don't report vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).
