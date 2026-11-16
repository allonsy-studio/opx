import type { Detector, DetectorContext } from "@allons-y/opx";

import { FORMAT_EXTENSIONS } from "./extensions.js";
import { runFormat } from "./runner.js";

/** The packages this plugin brings with it. */
const BUNDLED_DEPS = ["prettier"];

export const opxFormatDetector: Detector = {
	concern: "lint",
	phase: "format",
	id: "@allons-y/opx-format",
	shortName: "format",
	displayName: "Formatting (Prettier)",
	fileTypes: [...FORMAT_EXTENSIONS],

	detect(ctx: DetectorContext): boolean {
		for (const type of FORMAT_EXTENSIONS) {
			if (ctx.fileTypes.has(type)) return true;
		}
		return false;
	},

	describe() {
		return {
			summary: "Prettier formats every file type opx lints, configured by opx",
			bundledDeps: BUNDLED_DEPS,
		};
	},

	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runFormat(ctx, args);
	},
};
