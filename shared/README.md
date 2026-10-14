# Shared source

Source that several packages need but that doesn't belong in the engine, which
stays free of any specific tool.

`scripts/sync-shared.mjs` copies each file into the packages that opt in, at
`opx/<package>/src/shared/`. Every published package then carries its own copy
and needs no runtime dependency on a shared package. The copies are generated
and git-ignored, so edit the files here. The script runs on install and before
each package's build, test, coverage and typecheck.

| File | Used by |
|---|---|
| `eslint-runner.ts` | `lint-js`, `lint-json`, `lint-md` |

To opt a package out, for example when a better tool comes along to lint its
files, remove it from `TARGETS` in `scripts/sync-shared.mjs` and write its own
runner.
