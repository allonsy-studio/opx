import type { Command } from "commander";

import { buildContext } from "../context.js";
import { loadEnabledLintDetectors } from "../built-in.js";

export function registerLint(program: Command): void {
	program
		.command("lint")
		.description("Run lint via every enabled lint detector")
		.argument("[paths...]", "paths to lint (forwarded to each detector's runner)")
		.option("--fix", "auto-fix problems where the underlying linter supports it", false)
		.allowUnknownOption(true)
		.action(async (paths: string[], opts: { fix: boolean }, command) => {
			const cwd = process.cwd();
			const ctx = buildContext({ cwd, fix: opts.fix });
			const detectors = await loadEnabledLintDetectors(ctx);

			if (detectors.length === 0) {
				console.log("opx: no lint detectors are enabled. Run `opx init` to set them up.");
				process.exit(0);
			}

			const passthrough: string[] = [...paths, ...(command.args.slice(paths.length))];

			let exitCode = 0;
			for (const detector of detectors) {
				if (!detector.run) continue;
				const code = await detector.run(ctx, passthrough);
				if (code !== 0) exitCode = code;
			}
			process.exit(exitCode);
		});
}
