import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";
import { filterPathsByExtension } from "@allons-y/opx";

import type { Linter } from "eslint";

import { MD_EXTENSIONS } from "./extensions.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the ESLint flat config opx-lint-md should hand to the ESLint Node API.
 *
 * Order:
 *   1. user override (.opx/config.json` → lint.md), resolved relative to host cwd
 *   2. bundled default (`eslint.config.js` shipped at this package's root)
 */
function resolveConfigPath(ctx: DetectorContext): string {
	const override = ctx.config.lint?.md as string | undefined;
	if (typeof override === "string") {
		return isAbsolute(override) ? override : resolve(ctx.cwd, override);
	}
	return resolve(HERE, "..", "eslint.config.js");
}

/**
 * If the host has a `.gitignore`, surface its patterns to ESLint as an
 * additional ignore layer. Keeps "if it's gitignored, opx ignores it"
 * in sync with the rest of opx's committed-tree philosophy.
 */
async function gitignoreBaseConfig(ctx: DetectorContext): Promise<Linter.Config[] | undefined> {
	const gitignorePath = join(ctx.cwd, ".gitignore");
	if (!existsSync(gitignorePath)) return undefined;
	const { includeIgnoreFile } = await import("@eslint/compat");
	return [includeIgnoreFile(gitignorePath)];
}

export default async function runEslint(ctx: DetectorContext, args: string[]): Promise<number> {
	const { ESLint } = (await import("eslint")) as typeof import("eslint");

	// Per-language cache file so detectors running in parallel don't clobber a
	// shared cache.
	const cachePath = join(ctx.cwd, ".opx", "cache", "eslint", "md");

	const eslint = new ESLint({
		cwd: ctx.cwd,
		overrideConfigFile: resolveConfigPath(ctx),
		baseConfig: await gitignoreBaseConfig(ctx),
		cache: true,
		cacheLocation: cachePath,
		fix: ctx.fix,
		// A configured language whose patterns match no files (e.g. no .mdx in
		// the tree) should be a no-op, not a hard error.
		errorOnUnmatchedPattern: false,
	});

	// When the CLI forwards explicit paths, lint only the ones we own; if none
	// are ours, there's nothing to do.
	const requested = args.length > 0 ? filterPathsByExtension(args, MD_EXTENSIONS) : null;
	if (requested && requested.length === 0) return 0;
	const paths = requested ?? ["**/*.md", "**/*.mdx"];
	const results = await eslint.lintFiles(paths);

	if (ctx.fix) await ESLint.outputFixes(results);

	const formatter = await eslint.loadFormatter("stylish");
	const output = await formatter.format(results);
	if (output) ctx.write(`${output}\n`);

	return results.some((r) => r.errorCount > 0) ? 1 : 0;
}
