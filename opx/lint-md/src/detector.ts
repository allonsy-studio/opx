import type { Detector, DetectorContext } from "@allons-y/opx";
import { eslintCleanup } from "shared/eslint-cleanup.js";

import runEslint from "./runner.js";
import { MD_EXTENSIONS } from "./extensions.js";

/** The packages this plugin brings with it. */
const BUNDLED_DEPS = ["eslint", "@eslint/markdown"];

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
			bundledDeps: BUNDLED_DEPS,
		};
	},

	cleanup(ctx: DetectorContext) {
		return eslintCleanup(ctx, { id: "@allons-y/opx-lint-md", shortName: "md", bundledDeps: BUNDLED_DEPS, from: import.meta.url });
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runEslint(ctx, args);
	},
} as Detector;
