import type { Detector, DetectorContext } from "@allons-y/opx";
import { eslintCleanup } from "shared/eslint-cleanup.js";

import { runEslint } from "./runner.js";
import { JS_EXTENSIONS } from "./extensions.js";

/** The packages this plugin brings with it. */
const BUNDLED_DEPS = ["eslint", "@eslint/js", "@stylistic/eslint-plugin", "globals"];

export const opxLintJsDetector: Detector = {
	concern: "lint",
	id: "@allons-y/opx-lint-js",
	shortName: "js",
	displayName: "JavaScript (ESLint + @stylistic)",
	fileTypes: [...JS_EXTENSIONS],

	detect(ctx: DetectorContext): boolean {
		for (const type of JS_EXTENSIONS) {
			if (ctx.fileTypes.has(type)) return true;
		}
		return false;
	},

	describe() {
		return {
			summary: "ESLint with @stylistic, configured by opx",
			bundledDeps: BUNDLED_DEPS,
		};
	},

	cleanup(ctx: DetectorContext) {
		return eslintCleanup(ctx, { id: "@allons-y/opx-lint-js", shortName: "js", bundledDeps: BUNDLED_DEPS, from: import.meta.url });
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runEslint(ctx, args);
	},
};
