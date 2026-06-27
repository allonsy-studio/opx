import type { Command } from "commander";

import { buildContext } from "../context.js";
import builtIns from "../built-in.js";
import { runDetectorsGrouped } from "../run-detectors.js";
import { CLI_NAME } from "../plugin-kit.js";

export default function register(program: Command): void {
	program
		.command("lint")
		.description("Run lint via every enabled linter")
		.argument("[paths...]", "paths to lint (forwarded to each detector's runner)")
		.option("--fix", "auto-fix problems where the underlying linter supports it", false)
		.allowUnknownOption(true)
		.action(async (paths: string[], opts: { fix: boolean }, command) => {
			const cwd = process.cwd();
			const ctx = buildContext({ cwd, fix: opts.fix });
			const detectors = (await builtIns.load(ctx)).filter((d) => d.concern === "lint");

			if (detectors.length === 0) {
				console.log(`${CLI_NAME}: no linters are detected. Run \`${CLI_NAME} init\` to set them up.`);
				process.exit(0);
			}

			const passthrough: string[] = [...paths, ...(command.args.slice(paths.length))];

			// Run every enabled detector concurrently with grouped, colored output.
			const exitCode = await runDetectorsGrouped(ctx, detectors, passthrough);
			process.exit(exitCode);
		});
}
