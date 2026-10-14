# Shared source

A private workspace (`@allons-y/opx-shared`) for source that several packages
need but that doesn't belong in the engine, which stays free of any specific
tool. It is never published.

Packages import these files directly while developing, for example
`../../shared/src/eslint-runner.js` from `opx/lint-js/src/runner.ts`. Nothing is
generated into the packages. The workspace has its own tests and typecheck, which
run with the others.

`scripts/shared.js` handles the rest:

- `build`, run by each package's build, compiles the shared file beside its
  source (git-ignored), so built packages resolve it inside the repo.
- `inject`, run by each package's `prepack`, copies the compiled file into
  the package's `bin/shared/` and points the built imports at it. The published
  package carries its own copy and has no runtime dependency on a shared package.

| File | Used by |
|---|---|
| `src/eslint-runner.ts` | `lint-js`, `lint-json`, `lint-md` |

To opt a package out, for example when a better tool comes along to lint its
files, remove it from `TARGETS` in `scripts/shared.js`, drop its `prepack`
script, and write its own runner.
