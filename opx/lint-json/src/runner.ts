import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the ESLint flat config opx-lint-json should hand to the ESLint Node API.
 *
 * Order:
 *   1. user override (`opx.config.json` → overrides.json.eslint), resolved relative to host cwd
 *   2. bundled default (`eslint.config.js` shipped at this package's root)
 */
function resolveConfigPath(ctx: DetectorContext): string {
	const override = ctx.config.overrides?.json?.eslint;
	if (override) {
		return isAbsolute(override) ? override : resolve(ctx.cwd, override);
	}
	return resolve(HERE, "..", "eslint.config.js");
}

/**
 * Determine which JSON dialects to lint based on user choice during opx init.
 * Stored as a comma-separated string in `opx.config.json` → overrides.json.dialects
 * (e.g. "jsonc,json5"). Plain ".json" is always included.
 */
function resolveDialects(ctx: DetectorContext): Set<string> {
	const dialects = new Set<string>(["json"]);
	const raw = ctx.config.overrides?.json?.dialects;
	if (!raw) return dialects;
	for (const part of raw.split(",").map((s) => s.trim().toLowerCase())) {
		if (part === "jsonc" || part === "json5") dialects.add(part);
	}
	return dialects;
}

function defaultPaths(ctx: DetectorContext): string[] {
	const dialects = resolveDialects(ctx);
	const paths: string[] = ["**/*.json"];
	if (dialects.has("jsonc")) paths.push("**/*.jsonc");
	if (dialects.has("json5")) paths.push("**/*.json5");
	return paths;
}

export async function runEslint(ctx: DetectorContext, args: string[]): Promise<number> {
	const { ESLint } = (await import("eslint")) as typeof import("eslint");

	const cachePath = join(ctx.cwd, ".opx", "cache", "eslint", "cache");

	const eslint = new ESLint({
		cwd: ctx.cwd,
		overrideConfigFile: resolveConfigPath(ctx),
		cache: true,
		cacheLocation: cachePath,
	});

	const paths = args.length > 0 ? args : defaultPaths(ctx);
	const results = await eslint.lintFiles(paths);

	const formatter = await eslint.loadFormatter("stylish");
	const output = await formatter.format(results);
	if (output) process.stdout.write(`${output}\n`);

	return results.some((r) => r.errorCount > 0) ? 1 : 0;
}
