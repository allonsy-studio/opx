import type { Detector, DetectorContext } from "@allons-y/opx";

import { colors } from "./colors.js";

/**
 * Run detectors in two phases while keeping their output cleanly grouped.
 *
 * `format` detectors run first, one at a time, so they finish rewriting files
 * before any checker reads them. The rest (`check`, the default) then run
 * concurrently. Each detector writes into its own buffer (via a per-run
 * `ctx.write`) so runs never interleave on stdout; once every run settles, the
 * buffers are flushed in run order behind a colored header. Every detector
 * runs even when an earlier one fails. Returns the first non-zero exit code, or
 * 0 if every detector passed.
 */
export async function runDetectorsGrouped(
	ctx: DetectorContext,
	detectors: Detector[],
	args: string[],
): Promise<number> {
	const runOne = async (detector: Detector) => {
		let buffer = "";
		/** Copied by descriptor, not a spread, which would read the context's lazy getters eagerly. */
		const runCtx = Object.defineProperties(
			{},
			{
				...Object.getOwnPropertyDescriptors(ctx),
				write: {
					value: (chunk: string) => {
						buffer += chunk;
					},
					enumerable: true,
					writable: true,
					configurable: true,
				},
			},
		) as DetectorContext;
		const code = typeof detector.run === "function" ? await detector.run(runCtx, args) : 0;
		return { detector, code, output: buffer.trim() };
	};

	const results: Awaited<ReturnType<typeof runOne>>[] = [];
	for (const detector of detectors.filter((d) => d.phase === "format")) results.push(await runOne(detector));
	results.push(...(await Promise.all(detectors.filter((d) => d.phase !== "format").map(runOne))));

	for (const { detector, code, output } of results) {
		if (output === "") {
			process.stdout.write(
				`${colors.green("✔")} ${colors.bold(detector.shortName)} ${colors.dim("— no issues")}\n`,
			);
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
