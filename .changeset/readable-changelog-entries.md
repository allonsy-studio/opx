---
"@allons-y/opx-release": minor
---

The custom changelog reads better and renders cleanly:

- A `migration:` (or `upgrade:`) line in a changeset becomes a **To upgrade:** paragraph under the entry.
- Fenced code blocks stay inside their entry, and `#123` inside code is no longer turned into a link.
- 📝 marks each entry's PR or commit link.
- Dependency bumps show the old and new versions with a link to the diff between their tags. A single bump takes one line.
- `releaseDate: true` (or `opx release init --changelog --date`) adds a `📅 _Released 8 November 2026_` line under each new version.

Summary lines inside fenced code are never read as `pr:`, `commit:`, `author:`, or `migration:` lines, and `#123` in inline code or a URL stays as written. Bots such as Renovate are never thanked. Maintainers come from the workspace root even when a script runs inside a workspace. `init --changelog` keeps options you already set, and `--date` alone opts in. Release dates skip `--snapshot=<name>`, keep CRLF line endings, and join changesets' own commit with `"commit": true`.
