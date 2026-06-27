# Contributing

Thanks for considering a contribution! This project is small and friendly — here's what you need to know.

## Development setup

```bash
nvm use            # Node 24 (see .nvmrc)
corepack enable    # Yarn 4
yarn install
```

## Common commands

| Command         | What it does                                      |
| --------------- | ------------------------------------------------- |
| `yarn build`    | Type-check (tsc `--noEmit`) and bundle to `bin/`. |
| `yarn test`     | Run the Jest test suite.                          |
| `yarn coverage` | Run tests with coverage. Locally, prints a table. |
| `yarn lint`     | Run prettier, eslint, and markdownlint.           |
| `yarn format`   | Auto-fix lint and formatting issues.              |

## Commit conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint via a pre-commit hook.

Releases are managed with [changesets](https://github.com/changesets/changesets). When you make a user-facing change, add a changeset so the version bump and changelog entry are recorded:

```sh
yarn changeset
```

Pick `patch` for bug fixes, `minor` for new features, and `major` for breaking changes. Internal-only changes (refactors, tests, CI, tooling) don't need a changeset.

## Pull requests

- Open an issue first for substantive changes — small fixes can skip this.
- Keep PRs focused. One change per PR is easier to review.
- Update tests for any behavior change.
- The CI workflow runs build, lint, and the full test suite — make sure it's green.
- Releases are managed by changesets: merging PRs with changesets into `main` opens a "Version Packages" PR; merging that PR publishes the updated packages.

## Questions

Stuck on something? Start a thread in [Discussions](https://github.com/castastrophe/actions-pr-auto-update/discussions). The issue tracker is for bugs and feature requests.
