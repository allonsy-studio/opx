import type { Command } from "commander";

import type { DetectorContext } from "@allons-y/opx";

import builtIns from "../built-in.js";
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
 * @returns The first non-zero detector exit code, or `0` if all pass.
 */
export async function runBuildCommand(ctx: DetectorContext, paths: string[]): Promise<number> {
	const detectors = (await builtIns.load(ctx)).filter((d) => d.concern === "build");

	if (detectors.length === 0) {
		console.log(`${CLI_NAME}: no builders are detected. Run \`${CLI_NAME} init\` to set them up.`);
		return 0;
	}

	return runDetectorsGrouped(ctx, detectors, paths);
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
