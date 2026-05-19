import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the ESLint flat config opx-lint-md should hand to the ESLint Node API.
 *
 * Order:
 *   1. user override (`opx.config.json` → overrides.md.eslint), resolved relative to host cwd
 *   2. bundled default (`eslint.config.js` shipped at this package's root)
 */
function resolveConfigPath(ctx: DetectorContext): string {
	const override = ctx.config.overrides?.md?.eslint;
	if (override) {
		return isAbsolute(override) ? override : resolve(ctx.cwd, override);
	}
	return resolve(HERE, "..", "eslint.config.js");
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

	const paths = args.length > 0 ? args : ["**/*.md", "**/*.mdx"];
	const results = await eslint.lintFiles(paths);

	const formatter = await eslint.loadFormatter("stylish");
	const output = await formatter.format(results);
	if (output) process.stdout.write(`${output}\n`);

	return results.some((r) => r.errorCount > 0) ? 1 : 0;
}
