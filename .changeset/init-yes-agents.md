---
"@allons-y/opx-cli": minor
---

Set up opx with one command and no prompts, so scripts and AI agents can adopt it.

- `opx init --yes` accepts every plugin your files match; `--accept js,md,release` names them, including `release`, which files can't imply. Both install packages, write the config, scaffold `eslint.config.js`, add the `lint` script, and install the hook. Unknown names and failed installs exit `1`.
- `opx scan --json` adds `packageManager`, `install`, and `setup`, the commands that add and enable what's missing.
- While the CLI is a prerelease, plugins install from its dist-tag (`@beta`). A bare `npm install @allons-y/opx-lint-js` failed because the packages have only prereleases.
- The `release` suggestion no longer claims it was found in your files.
- The docs site publishes `llms.txt` and a guide, "Use opx with an AI agent".
