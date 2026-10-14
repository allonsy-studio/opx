import type { Detector, DetectorContext } from "@allons-y/opx";

import { runEslint } from "./runner.js";
import { TS_EXTENSIONS } from "./extensions.js";

export const opxLintTsDetector: Detector = {
	concern: "lint",
	id: "@allons-y/opx-lint-ts",
	shortName: "ts",
	displayName: "TypeScript (ESLint + typescript-eslint + @stylistic)",
	fileTypes: [...TS_EXTENSIONS],

	detect(ctx: DetectorContext): boolean {
		for (const type of TS_EXTENSIONS) {
			if (ctx.fileTypes.has(type)) return true;
		}
		return false;
	},

	describe() {
		return {
			summary: "ESLint with typescript-eslint and @stylistic, configured by opx",
			bundledDeps: [
				"eslint",
				"typescript-eslint",
				"@stylistic/eslint-plugin",
			],
		};
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runEslint(ctx, args);
	},
};
