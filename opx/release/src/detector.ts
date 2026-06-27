import type { Detector, DetectorContext } from "@allons-y/opx";

import { runRelease } from "./runner.js";

export const opxReleaseDetector: Detector = {
	id: "@allons-y/opx-release",
	shortName: "release",
	displayName: "Release (changesets)",
	concern: "release",

	detect(ctx: DetectorContext): boolean {
		return typeof ctx.config.release !== "undefined";
	},

	describe() {
		return {
			summary: "Changesets-based release flow for @allons-y/opx",
			bundledDeps: [
				"@changesets/cli",
				"@changesets/get-github-info",
				"@changesets/write",
				"@clack/prompts",
				"@manypkg/get-packages",
				"dotenv",
			],
		};
	},

	/**
	 * Run the release flow. Sets up changesets (lightweight) on first run and
	 * forwards subcommands to the changesets CLI.
	 * @param ctx - The detector context.
	 * @param args - Subcommand + arguments forwarded to the changesets CLI.
	 * @returns The exit code of the changesets CLI.
	 */
	async run(ctx: DetectorContext, args: string[]): Promise<number> {
		return runRelease(ctx, args);
	},
};
