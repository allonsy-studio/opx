---
"@allons-y/opx-release": minor
---

`opx release publish` now runs the whole release: it publishes, tags each new version, pushes the tags, and creates a GitHub release from each version's changelog notes. A repository with an `action.yml` is released as a GitHub Action: the build is committed onto a release-only commit, the version tag points at it, and the major tag (`v1`) moves to it. Every step skips what's already done, so a failed run can be re-run, and each run ends with a summary of every package. Turn steps off with `release` settings in `.opx/config.json` or with `--no-push`, `--no-github-release`, and `--action`/`--no-action`. With `changesets/action`, set `createGithubReleases: false`.

Messages from every `opx release` command now share one style: a status symbol, the result, and details, with colors and symbols that follow the terminal (`NO_COLOR` and `FORCE_COLOR` work).
