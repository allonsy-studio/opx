---
"@allons-y/opx": minor
"@allons-y/opx-cli": patch
---

`release` and `test` in `.opx/config.json` can hold settings instead of `true`; settings turn the task on. `opx init`, `opx scan`, and `opx enable` keep the settings, and the new `isTaskEnabled` export tells whether a task is on.
