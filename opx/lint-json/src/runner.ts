import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";
import { runEslint } from "@allons-y/opx";

import { JSON_EXTENSIONS } from "./extensions.js";

const CONFIG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pick the paths to lint by default. Plain `.json` is always included;
 * `jsonc` and `json5` are added when chosen during `opx init`, which stores
 * them as `lint.json.dialects` in `.opx/config.json`.
 */
function defaultPaths(ctx: DetectorContext): string[] {
	const dialects = new Set<string>((ctx.config.lint?.json as Record<string, unknown> | undefined)?.dialects as string[] | undefined ?? []);
	const paths = ["**/*.json"];
	if (dialects.has("jsonc")) paths.push("**/*.jsonc");
	if (dialects.has("json5")) paths.push("**/*.json5");
	return paths;
}

/**
 * Lint JSON, JSONC, and JSON5 with ESLint.
 *
 * @param ctx - The detector context.
 * @param args - Paths forwarded from the command line.
 * @returns `1` when any file has an error, otherwise `0`.
 */
export default function run(ctx: DetectorContext, args: string[]): Promise<number> {
	return runEslint(ctx, args, {
		key: "json",
		extensions: JSON_EXTENSIONS,
		defaultPaths,
		configDir: CONFIG_DIR,
		loadEslint: async () => (await import("eslint")).ESLint,
		loadIgnoreFile: async () => (await import("@eslint/compat")).includeIgnoreFile,
	});
}
