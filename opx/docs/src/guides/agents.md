---
layout: layouts/docs.njk
title: Use opx with an AI agent
description: Set up and run opx from an AI coding agent with no prompts.
eleventyNavigation:
    parent: Guides
    key: Use opx with an AI agent
    order: 4
---

opx never prompts without a terminal, prints actionable errors, and exits with a clear code, so an agent can adopt it in a few commands.

## Set up

1. Install the CLI with the project's package manager.

   ```sh
   yarn add --dev @allons-y/opx-cli
   ```

2. Look at what opx would do.

   ```sh
   opx scan --json
   ```

   `suggestions` lists matching plugins and `packageManager` says which manager opx will use. `install` and `setup` are the commands that add what's missing, or `null` when there is nothing to do. See [`opx scan`](../../cli/scan/).

3. Set everything up with one command.

   ```sh
   opx init --yes                   # every plugin your files match
   opx init --accept js,md,release  # exactly these
   ```

   This installs packages, writes `.opx/config.json`, scaffolds `eslint.config.js`, adds a `lint` script, and installs the git hook. `--yes` never enables `release`, so name it when the project publishes. See [Without prompts](../../cli/init/#without-prompts).

4. Check that it works.

   ```sh
   opx lint
   ```

5. Commit `.opx/config.json`, `eslint.config.js`, `package.json`, the lockfile, and `.husky/`.

## Day to day

| Task | Command |
| --- | --- |
| Lint | `opx lint` (exit `0` clean, `1` problems) |
| Fix what can be fixed | `opx lint --fix` |
| Check for plugins you haven't enabled | `opx scan --strict` (exit `1` if any) |
| Turn a plugin on or off | `opx enable <name>`, `opx disable <name>` |
| Record a release note | `opx release add --type patch --pkg <name> --summary "<text>"` |

## Rules of thumb

- Read exit codes, not output text. Errors print to stderr; add `--debug` for a stack trace.
- When a command can't prompt, its message names the flags that replace the prompt.
- Don't edit `.opx/state.json`; it's local bookkeeping.
- After `opx enable`, run `opx lint` and confirm the plugin's group appears in the output.
- If `init` can't tell which package manager to use, it prints the install command instead of running it. Run it yourself.
- Cleanup (`--cleanup`) only prints advice without a terminal. Make those changes yourself, one at a time.

The docs site also publishes an [`llms.txt`](/llms.txt) index of every page.
