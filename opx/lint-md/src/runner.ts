import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";
import { runEslint } from "shared/eslint-runner.js";

import { MD_EXTENSIONS } from "./extensions.js";

/** The package root, where the bundled `eslint.config.js` lives. */
const CONFIG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Lint Markdown with ESLint.
 *
 * @param ctx - The detector context.
 * @param args - Paths forwarded from the command line.
 * @returns `1` when any file has an error, otherwise `0`.
 */
export default function run(ctx: DetectorContext, args: string[]): Promise<number> {
	return runEslint(ctx, args, {
		key: "md",
		extensions: MD_EXTENSIONS,
		defaultPaths: () => ["**/*.md", "**/*.mdx"],
		configDir: CONFIG_DIR,
		loadEslint: async () => (await import("eslint")).ESLint,
		loadIgnoreFile: async () => (await import("@eslint/compat")).includeIgnoreFile,
	});
}
