import type { Command } from "commander";

import type { DetectorContext } from "@allons-y/opx";

import { buildContext } from "../context.js";
import builtIns from "../built-in.js";
import { runDetectorsGrouped } from "../run-detectors.js";
import { CLI_NAME } from "../plugin-kit.js";

/**
 * Run every enabled lint plugin.
 *
 * Loads the installed detectors, keeps only the `lint`-concern ones, and runs
 * them concurrently with grouped output. Returns `0` when no linters are
 * configured.
 *
 * @param ctx - The detector context for the host repo (`ctx.fix` enables auto-fix).
 * @param args - Paths and other arguments forwarded to each detector's runner.
 * @returns The first non-zero detector exit code, or `0` if all pass.
 */
export async function runLintCommand(ctx: DetectorContext, args: string[]): Promise<number> {
	const detectors = (await builtIns.load(ctx)).filter((d) => d.concern === "lint");

	if (detectors.length === 0) {
		console.log(`${CLI_NAME}: no linters are detected. Run \`${CLI_NAME} init\` to set them up.`);
		return 0;
	}

	return runDetectorsGrouped(ctx, detectors, args);
}

export default function register(program: Command): void {
	program
		.command("lint")
		.description("Run lint via every enabled linter")
		.argument("[paths...]", "paths to lint (forwarded to each detector's runner)")
		.option("--fix", "auto-fix problems where the underlying linter supports it", false)
		.allowUnknownOption(true)
		.action(async (paths: string[], opts: { fix: boolean }, command) => {
			const ctx = buildContext({ cwd: process.cwd(), fix: opts.fix });
			// Unknown flags land in command.args after the declared paths; forward them too.
			const passthrough: string[] = [...paths, ...command.args.slice(paths.length)];
			process.exit(await runLintCommand(ctx, passthrough));
		});
}
