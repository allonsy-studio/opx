---
"@allons-y/opx-format": minor
---

Add `@allons-y/opx-format`, a plugin that formats with Prettier. It checks with `opx lint` and writes with `opx lint --fix`, runs before the other lint plugins, and skips files your `.gitignore` and `.prettierignore` list. The default config uses tabs, double quotes, semicolons, trailing commas, and a 120-column print width, with two spaces for JSON. It's exported at `@allons-y/opx-format/prettier`, and `lint.format` can point at your own Prettier config.
