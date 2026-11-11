import type { Command } from "commander";

import type { DetectorContext } from "@allons-y/opx";

import builtIns, { reportLoadFailures } from "../built-in.js";
import { runDetectorsGrouped } from "../run-detectors.js";
import { CLI_NAME, toAction } from "../plugin-kit.js";

/**
 * Build via every enabled builder in the host's opx setup.
 *
 * Loads the installed detectors, keeps only the `build`-concern ones, and runs
 * them with grouped/colored output. Returns `0` when no builders are configured.
 *
 * @param ctx - The detector context for the host repo.
 * @param paths - Paths forwarded to each detector's runner.
 * @returns The first non-zero detector exit code, `1` if an enabled plugin couldn't be loaded, or `0` if all pass.
 */
export async function runBuildCommand(ctx: DetectorContext, paths: string[]): Promise<number> {
	const { detectors, failures } = await builtIns.loadTask(ctx, "build");
	reportLoadFailures(failures);

	if (detectors.length === 0) {
		if (failures.length === 0) console.log(`${CLI_NAME}: no builders are detected. Run \`${CLI_NAME} init\` to set them up.`);
		return failures.length > 0 ? 1 : 0;
	}

	const code = await runDetectorsGrouped(ctx, detectors, paths);
	return code !== 0 ? code : failures.length > 0 ? 1 : 0;
}

export default function register(program: Command): void {
	program
		.command("build")
		.description(`Build via every enabled builder in the ${CLI_NAME} setup`)
		.argument("[paths...]", "paths to build (forwarded to each detector's runner)")
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.action(toAction(runBuildCommand));
}
