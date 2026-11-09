---
"@allons-y/opx": minor
"@allons-y/opx-cli": patch
---

Saving `.opx/config.json` now warns when it leaves out a top-level key opx doesn't know. `opx enable`, `opx disable`, and `opx init` name the removed keys instead of dropping them silently. `writeConfig` returns the keys it left out, and the engine exports `CONFIG_KEYS`, the keys it keeps.
