---
"@allons-y/opx-release": patch
---

The starter `.changeset/config.json` now comes from the package's own `config.json`, so the exported file matches what `opx release init` writes. The old export held settings changesets doesn't read (`format`) and paths that don't match a `dist/` build. The `.changeset/README.md` it writes now says when to add a changeset instead of listing commands. The README documents the `changeset`, `version`, and `release` scripts, npm trusted publishing, pre-releases, and snapshot releases.
