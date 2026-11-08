import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import { runAdd } from "./add.js";
import { detectBaseBranch } from "./base-branch.js";

/** Read the starter config shipped as `@allons-y/opx-release/config.json`. */
export function starterConfig(): Record<string, unknown> {
	return JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8")) as Record<string, unknown>;
}

/** The `.changeset/README.md` written on first use. */
export const CHANGESET_README = `# Changesets

Add a changeset for any change a consumer would notice: run \`yarn changeset\` and write the summary for the changelog. Docs, tests, CI, and internal refactors need none. The release workflow versions and publishes the packages; see [\`@allons-y/opx-release\`](https://www.npmjs.com/package/@allons-y/opx-release).
`;

/**
 * Ensure the host repo has a changesets setup. Writes the starter `config.json`,
 * with this repository's `baseBranch`, and a short README when none exists.
 *
 * @returns true if it created the config, false if one was already present.
 */
export function init(ctx: DetectorContext): boolean {
	const dir = join(ctx.cwd, ".changeset");
	const configFile = join(dir, "config.json");
	if (existsSync(configFile)) return false;

	mkdirSync(dir, { recursive: true });
	const config = { ...starterConfig(), baseBranch: detectBaseBranch(ctx.cwd) };
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
