---
"@allons-y/opx": patch
---

`.opx/config.json` stays committable when `.gitignore` already had opx entries in the wrong order or a line hiding the whole `.opx` folder. opx now drops those lines and writes `.opx/*` followed by `!.opx/config.json`.
