import type { Detector, DetectorContext } from "@allons-y/opx";

import { runEslint } from "./runner.js";
import { JS_EXTENSIONS } from "./extensions.js";

export const opxLintJsDetector: Detector = {
	concern: "lint",
	id: "@allons-y/opx-lint-js",
	shortName: "js",
	displayName: "JavaScript / TypeScript (ESLint + @stylistic)",
	fileTypes: [...JS_EXTENSIONS],

	detect(ctx: DetectorContext): boolean {
		for (const type of JS_EXTENSIONS) {
			if (ctx.fileTypes.has(type)) return true;
		}
		return false;
	},

	describe() {
		return {
			summary: "ESLint with @stylistic and typescript-eslint, configured by opx",
			bundledDeps: [
				"eslint",
				"@eslint/js",
				"@stylistic/eslint-plugin",
				"typescript-eslint",
				"globals",
			],
		};
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runEslint(ctx, args);
	},
};
