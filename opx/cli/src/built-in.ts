import type { Detector, DetectorContext, PackageJson } from "@allons-y/opx";
import { loadPlugins, normalizeDetectorId } from "@allons-y/opx";

/**
 * Built-in lint detector registry. opx-cli knows the official @allons-y/opx-lint-*
 * packages by name; the actual detector code lives in those packages and is
 * loaded dynamically only if the user has installed them. The CLI does NOT
 * pre-install them — staying tiny is a design goal.
 */
export const BUILTIN_LINT_SHORT_NAMES = ["js", "css", "md", "json"] as const;

export type BuiltinLintShortName = (typeof BUILTIN_LINT_SHORT_NAMES)[number];

/**
 * For each built-in short name, what would the user need to install. Used
 * during init/scan to suggest the right install command.
 */
export const BUILTIN_LINT_PACKAGE_HINTS: Record<BuiltinLintShortName, string> = {
	js: "@allons-y/opx-lint-js",
	css: "@allons-y/opx-lint-css",
	md: "@allons-y/opx-lint-md",
	json: "@allons-y/opx-lint-json",
};

/**
 * Determine which built-in lint detectors *would* match the host repo based on
 * file types alone (without actually loading the detector packages). This lets
 * us suggest "install @allons-y/opx-lint-css" before the user has installed it.
 */
export function suggestBuiltins(fileTypes: Set<string>): BuiltinLintShortName[] {
	const hits: BuiltinLintShortName[] = [];
	if (
		fileTypes.has(".js") || fileTypes.has(".mjs") || fileTypes.has(".cjs") ||
		fileTypes.has(".ts") || fileTypes.has(".tsx") || fileTypes.has(".jsx")
	) hits.push("js");
	if (fileTypes.has(".css")) hits.push("css");
	if (fileTypes.has(".md") || fileTypes.has(".mdx")) hits.push("md");
	if (fileTypes.has(".json") || fileTypes.has(".jsonc")) hits.push("json");
	return hits;
}

/**
 * Load any of the enabled built-in lint detectors that are also installed in
 * the host project. Missing installs emit a warning via the loader's normal
 * trust-check flow.
 */
export async function loadEnabledLintDetectors(ctx: DetectorContext): Promise<Detector[]> {
	const installed = ctx.config.lint.filter((shortName) =>
		normalizeDetectorId(shortName, ctx.hostPkg, "lint") !== null,
	);
	const plugins = await loadPlugins(installed, {
		hostPkg: ctx.hostPkg,
		cwd: ctx.cwd,
		logger: ctx.logger,
		concern: "lint",
	});
	return plugins.flatMap((p) => p.detectors);
}

/**
 * Build a list of "virtual" detector descriptors for built-in lint packages
 * that aren't installed yet but would match. Used by scan/init to show
 * suggestions before the user has run yarn add.
 */
export function virtualBuiltinDetectors(
	fileTypes: Set<string>,
	hostPkg: PackageJson,
): Array<{ shortName: string; pkg: string; reason: string; installed: boolean }> {
	const matched = suggestBuiltins(fileTypes);
	const deps = { ...(hostPkg.dependencies ?? {}), ...(hostPkg.devDependencies ?? {}) };
	return matched.map((shortName) => ({
		shortName,
		pkg: BUILTIN_LINT_PACKAGE_HINTS[shortName],
		reason: `Files matching ${shortName} found in the committed tree.`,
		installed: BUILTIN_LINT_PACKAGE_HINTS[shortName] in deps,
	}));
}
