import type { Detector, DetectorContext } from "@allons-y/opx";

import { colors } from "./colors.js";

/**
 * Run detectors concurrently while keeping their output cleanly grouped.
 *
 * Each detector writes into its own buffer (via a per-run `ctx.write`) so the
 * runs never interleave on stdout; once every run settles, the buffers are
 * flushed in detector order behind a colored header. Returns the first non-zero
 * exit code, or 0 if every detector passed.
 */
export async function runDetectorsGrouped(
	ctx: DetectorContext,
	detectors: Detector[],
	args: string[],
): Promise<number> {
	const results = await Promise.all(
		detectors.map(async (detector) => {
			let buffer = "";
			const runCtx: DetectorContext = {
				...ctx,
				write: (chunk) => {
					buffer += chunk;
				},
			};
			const code = typeof detector.run === "function" ? await detector.run(runCtx, args) : 0;
			return { detector, code, output: buffer.trim() };
		}),
	);

	for (const { detector, code, output } of results) {
		if (output === "") {
			process.stdout.write(`${colors.green("✔")} ${colors.bold(detector.shortName)} ${colors.dim("— no issues")}\n`);
			continue;
		}
		const mark = code === 0 ? colors.yellow("▸") : colors.red("▸");
		process.stdout.write(`\n${colors.bold(`${mark} ${detector.shortName}`)} ${colors.dim(detector.displayName)}\n`);
		process.stdout.write(`${output}\n`);
	}

	const exitCode = results.find((result) => result.code !== 0)?.code ?? 0;
	process.stdout.write(
		exitCode === 0
			? `\n${colors.green(colors.bold("✔ All checks passed."))}\n`
			: `\n${colors.red(colors.bold("✖ Some checks failed."))}\n`,
	);
	return exitCode;
}
