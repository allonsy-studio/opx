import type { Command } from "commander";

import type { DetectorContext } from "@allons-y/opx";

import builtIns from "../built-in.js";
import { CLI_NAME, toAction } from "../plugin-kit.js";

/**
 * Run the release flow via every enabled releaser in the host's opx setup.
 *
 * Loads the installed detectors, keeps only the `release`-concern ones, and
 * forwards the subcommand + args to each. Returns `0` when no releaser is
 * configured.
 *
 * @param ctx - The detector context for the host repo.
 * @param args - Subcommand + arguments forwarded to each releaser (e.g. `add`).
 * @returns The first non-zero detector exit code, or `0` if all pass.
 */
export async function runReleaseCommand(ctx: DetectorContext, args: string[]): Promise<number> {
	const detectors = (await builtIns.load(ctx)).filter((d) => d.concern === "release");

	if (detectors.length === 0) {
		console.log(`${CLI_NAME}: no releaser is detected. Run \`${CLI_NAME} init\` to set one up.`);
		return 0;
	}

	// Run releasers one at a time: the release flow is interactive (it prompts on
	// the real TTY), so detectors must not race for stdin/stdout. Returns the
	// first non-zero exit code.
	let exitCode = 0;
	for (const detector of detectors) {
		const code = typeof detector.run === "function" ? await detector.run(ctx, args) : 0;
		if (code !== 0 && exitCode === 0) exitCode = code;
	}
	return exitCode;
}

export default function register(program: Command): void {
	program
		.command("release")
		.description(`Run the release flow via the enabled releaser in the ${CLI_NAME} setup`)
		.argument("[args...]", "subcommand + arguments forwarded to the releaser (e.g. add, version, publish, status)")
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.action(toAction(runReleaseCommand));
}
