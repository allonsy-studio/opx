import type { Detector, DetectorContext } from "@allons-y/opx";

import run from "./runner.js";
import { JSON_EXTENSIONS } from "./extensions.js";

export default {
	id: "@allons-y/opx-lint-json",
	shortName: "json",
	concern: "lint",
	displayName: "JSON / JSONC / JSON5 (ESLint + @eslint/json)",
	fileTypes: [...JSON_EXTENSIONS],

	detect(ctx: DetectorContext): boolean {
		for (const type of JSON_EXTENSIONS) {
			if (ctx.fileTypes.has(type)) return true;
		}
		return false;
	},

	describe() {
		return {
			summary: "ESLint with @eslint/json, configured by opx",
			bundledDeps: [
				"eslint",
				"@eslint/json",
			],
		};
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return run(ctx, args);
	},
} as Detector;
