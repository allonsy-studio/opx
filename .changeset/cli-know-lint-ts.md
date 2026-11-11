---
"@allons-y/opx-cli": patch
---

`opx scan` and `opx init` now suggest `@allons-y/opx-lint-ts` for TypeScript files, and note that it needs `typescript`. `opx enable ts` works, and `opx enable @allons-y/opx-lint-ts` enables `ts` under `lint` instead of writing the package id to every task. A third-party plugin id is written under the tasks its detectors declare; if opx can't load it, pass `--task`. The `release` suggestion no longer claims it was found in your files.
