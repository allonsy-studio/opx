import type { Detector, DetectorContext } from "@allons-y/opx";

import runEslint from "./runner.js";
import { MD_EXTENSIONS } from "./extensions.js";

export default {
	id: "@allons-y/opx-lint-md",
	shortName: "md",
	concern: "lint",
	displayName: "Markdown (ESLint + @eslint/markdown)",
	fileTypes: [...MD_EXTENSIONS],

	detect(ctx: DetectorContext): boolean {
		for (const type of MD_EXTENSIONS) {
			if (ctx.fileTypes.has(type)) return true;
		}
		return false;
	},

	describe() {
		return {
			summary: "ESLint with @eslint/markdown, configured by opx",
			bundledDeps: [
				"eslint",
				"@eslint/markdown",
			],
		};
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runEslint(ctx, args);
	},
} as Detector;
