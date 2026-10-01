import type { Detector, DetectorContext, PackageJson } from "@allons-y/opx";
import { enabledNames, loadPlugins, normalizeDetectorId } from "@allons-y/opx";

import { PLUGIN_CATALOG, type BuiltInShortName } from "./plugin-catalog.js";

export type { BuiltInShortName };

/**
 * Built-in file-type detector registry. opx-cli knows the official
 * @allons-y/opx-(lint|build)-* packages by name; the actual detector code lives
 * in those packages and is loaded dynamically only if the user has installed
 * them. The CLI does NOT pre-install them — staying tiny is a design goal.
 *
 * The constants and helpers below are all derived from {@link PLUGIN_CATALOG},
 * the single source of truth for short names, packages, and file extensions.
 */

/** Short names that can be detected from file types alone (e.g. "js", "css"). */
export const SUPPORTED_FILE_EXTS: BuiltInShortName[] = PLUGIN_CATALOG
	.filter((entry) => entry.extensions.length > 0)
	.map((entry) => entry.shortName);

/**
 * Plugins that are not detectable by file types alone (e.g. "release", "test").
 * Used to generate virtual builtin detector suggestions and validate contributor
 * plugins.
 */
export const UNDETECTABLE_PLUGINS: BuiltInShortName[] = PLUGIN_CATALOG
	.filter((entry) => entry.extensions.length === 0)
	.map((entry) => entry.shortName);

/**
 * For each built-in short name, what would the user need to install. Used
 * during init/scan to suggest the right install command.
 */
export const PACKAGE_HINTS: Record<BuiltInShortName, string[]> = Object.fromEntries(
	PLUGIN_CATALOG.map((entry) => [entry.shortName, [...entry.packages]]),
) as Record<BuiltInShortName, string[]>;

/**
 * Determine which built-in detectors *would* match the host repo based on file
 * types alone (without actually loading the detector packages). This lets us
 * suggest "install @allons-y/opx-lint-css" before the user has installed it.
 */
export function suggest(fileTypes: Set<string>): BuiltInShortName[] {
	return PLUGIN_CATALOG
		.filter((entry) => entry.extensions.some((ext) => fileTypes.has(ext)))
		.map((entry) => entry.shortName);
}

/**
 * Load any of the enabled built-in lint detectors that are also installed in
 * the host project. Missing installs emit a warning via the loader's normal
 * trust-check flow.
 */
export async function load(ctx: DetectorContext): Promise<Detector[]> {
	const installedLinters = enabledNames(ctx.config.lint)
		.map((shortName) => `lint-${shortName}`)
		.filter((entry) => normalizeDetectorId(entry, ctx.hostPkg) !== null);
	const installedBuilders = enabledNames(ctx.config.build)
		.map((shortName) => `build-${shortName}`)
		.filter((entry) => normalizeDetectorId(entry, ctx.hostPkg) !== null);
	const installedRelease = ctx.config.release === true ? ["release"] : [];
	const installedTesting = ctx.config.test === true ? ["test"] : [];

	const installed = [...installedLinters, ...installedBuilders, ...installedRelease, ...installedTesting];

	const plugins = await loadPlugins(installed, {
		hostPkg: ctx.hostPkg,
		cwd: ctx.cwd,
		logger: ctx.logger,
	});
	return plugins.flatMap((p) => p.detectors);
}

/**
 * Build a list of "virtual" detector descriptors for built-in packages
 * that aren't installed yet but would match. Used by scan/init to show
 * suggestions before the user has installed them.
 */
export function virtualDetectors(
	fileTypes: Set<string>,
	hostPkg: PackageJson,
): Array<{ shortName: BuiltInShortName; pkg: string; reason: string; installed: boolean }> {
	const matched = suggest(fileTypes);
	const deps = { ...(hostPkg.dependencies ?? {}), ...(hostPkg.devDependencies ?? {}) };
	return [...matched, ...UNDETECTABLE_PLUGINS].reduce<Array<{ shortName: BuiltInShortName; pkg: string; reason: string; installed: boolean }>>((acc, shortName) => {
		for (const pkg of PACKAGE_HINTS[shortName]) {
			acc.push({
				shortName,
				pkg,
				reason: (UNDETECTABLE_PLUGINS as readonly string[]).includes(shortName) ? `Plugin ${shortName} found in the committed tree.` : `Files matching ${shortName} found in the committed tree.`,
				installed: pkg in deps,
			});
		}
		return acc;
	}, []);
}

export default {
	PACKAGE_HINTS,
	suggest,
	load,
	virtualDetectors,
};
