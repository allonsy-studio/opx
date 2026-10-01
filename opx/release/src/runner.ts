import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import { runAdd } from "./add.js";
import { detectBaseBranch } from "./base-branch.js";

/**
 * A lightweight, sensible-default changesets config for a host repo. Mirrors a
 * minimal `.changeset/config.json` so a project can start recording changes
 * without hand-authoring the file. `baseBranch` is filled in per repository.
 */
const DEFAULT_CHANGESET_CONFIG = {
	$schema: "https://unpkg.com/@changesets/config@3.1.4/schema.json",
	changelog: "@changesets/cli/changelog",
	commit: false,
	fixed: [],
	linked: [],
	access: "public",
	updateInternalDependencies: "patch",
	ignore: [],
};

const CHANGESET_README = `# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

- \`opx release add\` — record a change (choose the bump and write a summary)
- \`opx release version\` — apply pending changesets (bump versions + changelogs)
- \`opx release publish\` — publish the updated packages
- \`opx release status\` — show what would be released
`;

/**
 * Ensure the host repo has a changesets setup. Writes a lightweight default to
 * `.changeset/config.json` (plus a short README) when none exists.
 *
 * @returns true if it created the config, false if one was already present.
 */
export function init(ctx: DetectorContext): boolean {
	const dir = join(ctx.cwd, ".changeset");
	const configFile = join(dir, "config.json");
	if (existsSync(configFile)) return false;

	mkdirSync(dir, { recursive: true });
	const config = { ...DEFAULT_CHANGESET_CONFIG, baseBranch: detectBaseBranch(ctx.cwd) };
	writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");

	const readme = join(dir, "README.md");
	if (!existsSync(readme)) writeFileSync(readme, CHANGESET_README, "utf8");

	return true;
}

/** Resolve the bundled `@changesets/cli` executable (exported as `./bin.js`). */
function resolveChangesetBin(): string {
	const require = createRequire(import.meta.url);
	return require.resolve("@changesets/cli/bin.js");
}

/** Spawn the changesets CLI with the given args, inheriting stdio. */
function runChangeset(ctx: DetectorContext, args: string[]): Promise<number> {
	const bin = resolveChangesetBin();
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [bin, ...args], {
			cwd: ctx.cwd,
			stdio: "inherit",
		});
		child.on("close", (code) => resolve(code ?? 0));
		child.on("error", (err) => {
			console.error(`opx: failed to run changesets: ${err.message}`);
			resolve(1);
		});
	});
}

/**
 * Drive the release flow. Ensures changesets is set up (lightweight) and then
 * forwards to the changesets CLI:
 *
 *   opx release            → changeset status
 *   opx release init       → just write the starter config
 *   opx release add ...    → opx-native flow (prompts here, no interactive child)
 *   opx release <cmd> ...  → changeset <cmd> ... (version, publish, status, …)
 */
export async function runRelease(ctx: DetectorContext, args: string[]): Promise<number> {
	const created = init(ctx);
	if (created) console.log("opx: wrote a starter .changeset/config.json.");

	const [sub, ...rest] = args;

	// `opx release init` performs only the lightweight setup above.
	if (sub === "init") return 0;

	// `add` is the one interactive changesets command — opx owns its prompting
	// rather than spawning the changesets CLI's interactive flow.
	if (sub === "add") return runAdd(ctx, rest);

	// Every other subcommand is non-interactive; forward it to the changesets CLI.
	const forwarded = args.length > 0 ? args : ["status"];
	return runChangeset(ctx, forwarded);
}
