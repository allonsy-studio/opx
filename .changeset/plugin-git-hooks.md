---
"@allons-y/opx": minor
"@allons-y/opx-cli": minor
---

Plugins can now declare git hooks. A detector's new `hooks` field maps a hook name to `{ args, blocking? }`; `opx init` and `opx enable` install the hooks of each enabled plugin into `.husky/`, and `opx disable` removes only the line opx wrote. The new `opx hook <name>` runs every enabled plugin that declared that hook and exits with the first failure's code. A `blocking` hook runs in the foreground with git's arguments, so a failure stops the commit or push; the others run in the background and never block. In the engine, `installPostCommitHook` is replaced by `installHook(cwd, name, line)`, with `hookLine`, `removeHook` and `planHooks` alongside it.
