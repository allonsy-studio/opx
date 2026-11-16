import type { Command } from "commander";

import type { DetectorContext } from "@allons-y/opx";

import builtIns, { reportLoadFailures } from "../built-in.js";
import { CLI_NAME, toAction } from "../plugin-kit.js";

/**
 * Run the tests via every enabled test plugin in the host's opx setup.
 *
 * Loads the installed detectors, keeps only the `test`-concern ones, and
 * forwards the args to each, one at a time so their output doesn't interleave.
 * Returns `0` when no test plugin is configured.
 *
 * @param ctx - The detector context for the host repo.
 * @param args - Paths and flags forwarded to each test plugin (e.g. `--coverage`).
 * @returns The first non-zero detector exit code, `1` if an enabled plugin couldn't be loaded, or `0` if all pass.
 */
export async function runTestCommand(ctx: DetectorContext, args: string[]): Promise<number> {
	const { detectors, failures } = await builtIns.loadTask(ctx, "test");
	reportLoadFailures(failures);

	if (detectors.length === 0) {
		if (failures.length === 0) console.log(`${CLI_NAME}: no test plugin is detected. Run \`${CLI_NAME} enable test\` to set one up.`);
		return failures.length > 0 ? 1 : 0;
	}

	let exitCode = 0;
	for (const detector of detectors) {
		const code = typeof detector.run === "function" ? await detector.run(ctx, args) : 0;
		if (code !== 0 && exitCode === 0) exitCode = code;
	}
	return exitCode !== 0 ? exitCode : failures.length > 0 ? 1 : 0;
}

export default function register(program: Command): void {
	program
		.command("test")
		.description(`Run the tests via the enabled test plugin in the ${CLI_NAME} setup`)
		.argument("[args...]", "paths and flags forwarded to the test plugin (e.g. --coverage)")
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.action(toAction(runTestCommand));
}
