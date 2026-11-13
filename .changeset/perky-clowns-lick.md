---
"@allons-y/opx": patch
---

Running `opx init` again now upgrades the post-commit hook the first versions wrote, `( npx --no-install opx hook post-commit … ) || true`, to the current line. Before, the installer only upgraded the later `PATH="node_modules/.bin:$PATH"` line and left the `npx` one as is. When the old line sits after a top-level `exit`, where the first versions appended it, the new line goes above the `exit` so it runs. Other lines in the hook stay as they were.
