---
"@allons-y/opx-release": minor
---

Offer a more readable, print-friendly changelog format as an opt-in. Run `opx release init --changelog` to point `.changeset/config.json` at `@allons-y/opx-release/changelog`, or name it there yourself. Entries lead with the summary, then the PR or commit link, and thank only contributors outside the `maintainers` list, which defaults to the GitHub handles in the root `package.json` `author` and `contributors`. `repo` comes from `package.json` and falls back to `GITHUB_REPOSITORY`. The default generator is unchanged. Projects that copied `changelog.js` into `.changeset/`, or installed `@changesets/changelog-github`, can drop both.
