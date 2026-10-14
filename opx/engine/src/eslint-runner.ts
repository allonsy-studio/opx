import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { DetectorContext } from "./detector.js";
import { filterPathsByExtension } from "./paths.js";

/** The slice of an ESLint result that the runner reads. */
export type EslintResult = {
	/** How many errors the file has. */
	errorCount: number;
};

/** The slice of an ESLint instance that the runner calls. */
export type EslintInstance = {
	/** Lint files or globs and return a result per file. */
	lintFiles(patterns: string[]): Promise<EslintResult[]>;
	/** Load an output formatter by name, such as `stylish`. */
	loadFormatter(name: string): Promise<{
		/** Render results as text. */
		format(results: EslintResult[]): string | Promise<string>;
	}>;
};

/** The slice of the ESLint class that the runner calls. */
export type EslintClass = {
	new (options: never): EslintInstance;
	/** Write the fixes in the results to disk. */
	outputFixes(results: EslintResult[]): Promise<void>;
};

/** What a lint plugin supplies to {@link runEslint}. */
export type EslintRunSpec = {
	/** The plugin's short name, which keys its settings in `.opx/config.json` and names its cache file. */
	key: string;
	/** The file extensions the plugin owns, with the leading dot. */
	extensions: ReadonlySet<string>;
	/** The paths to lint when none are given. */
	defaultPaths(ctx: DetectorContext): string[];
	/** The directory holding the plugin's bundled `eslint.config.js`. */
	configDir: string;
	/** Load `ESLint` from the plugin's own dependencies. */
	loadEslint(): Promise<EslintClass>;
	/** Load `includeIgnoreFile` from the plugin's own dependencies; only called when a `.gitignore` exists. */
	loadIgnoreFile(): Promise<(path: string) => unknown>;
};

/**
 * Lint with ESLint as one language's detector.
 *
 * The plugin passes in `ESLint` rather than the engine importing it, so ESLint
 * resolves from the plugin's own dependencies in every package-manager layout.
 *
 * @param ctx - The detector context.
 * @param args - Paths forwarded from the command line; any the plugin doesn't own are dropped.
 * @param spec - The plugin's language settings.
 * @returns `1` when any file has an error, otherwise `0`.
 */
export async function runEslint(ctx: DetectorContext, args: string[], spec: EslintRunSpec): Promise<number> {
	const override = ctx.config.lint?.[spec.key];
	const configFile = typeof override === "string"
		? (isAbsolute(override) ? override : resolve(ctx.cwd, override))
		: join(spec.configDir, "eslint.config.js");

	const requested = args.length > 0 ? filterPathsByExtension(args, spec.extensions) : null;
	if (requested && requested.length === 0) return 0;

	const ESLint = await spec.loadEslint();

	// Surface .gitignore as an ignore layer so "if it's gitignored, opx ignores it".
	const gitignore = join(ctx.cwd, ".gitignore");
	const baseConfig = existsSync(gitignore) ? [(await spec.loadIgnoreFile())(gitignore)] : undefined;

	const eslint = new (ESLint as unknown as new (options: Record<string, unknown>) => EslintInstance)({
		cwd: ctx.cwd,
		overrideConfigFile: configFile,
		baseConfig,
		cache: true,
		// A cache file per language, so detectors running in parallel don't clobber each other.
		cacheLocation: join(ctx.cwd, ".opx", "cache", "eslint", spec.key),
		fix: ctx.fix,
		// A language whose patterns match no files should be a no-op, not a hard error.
		errorOnUnmatchedPattern: false,
	});

	const results = await eslint.lintFiles(requested ?? spec.defaultPaths(ctx));
	if (ctx.fix) await ESLint.outputFixes(results);

	const output = await (await eslint.loadFormatter("stylish")).format(results);
	if (output) ctx.write(`${output}\n`);

	return results.some((r) => r.errorCount > 0) ? 1 : 0;
}
