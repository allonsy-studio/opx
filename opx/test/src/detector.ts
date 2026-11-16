import { isTaskEnabled, type Detector, type DetectorContext } from "@allons-y/opx";

import { runTest } from "./runner.js";

export const opxTestDetector: Detector = {
	id: "@allons-y/opx-test",
	shortName: "test",
	displayName: "Test (node --test, c8)",
	concern: "test",

	detect(ctx: DetectorContext): boolean {
		return isTaskEnabled(ctx.config.test);
	},

	describe() {
		return {
			summary: "Runs node --test, with c8 coverage and thresholds",
			bundledDeps: ["c8"],
		};
	},

	/**
	 * Run the tests.
	 * @param ctx - The detector context.
	 * @param args - Paths and flags for `node --test`, and `--coverage`.
	 * @returns `0` when the tests pass and coverage meets its thresholds.
	 */
	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runTest(ctx, args);
	},
};
