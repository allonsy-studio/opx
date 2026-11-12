---
"@allons-y/opx-release": patch
---

`opx release publish` checks the registry when changesets fails, and finishes the release when every version is already there. A push right after a release no longer fails because npm is still processing the version the last run published.
