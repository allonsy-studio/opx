import type { Detector, DetectorContext, PackageJson } from "@allons-y/opx";
import { enabledNames, isTaskEnabled, loadPlugins, normalizeDetectorId } from "@allons-y/opx";

import { PLUGIN_CATALOG, isPackageId, type BuiltInShortName } from "./plugin-catalog.js";

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
 * Load the enabled plugins that are installed in the host project.
 *
 * Short names resolve to `@allons-y/opx-<task>-<name>`; full package ids load
 * as written. Each package loads once, even when several tasks enable it.
 */
export async function load(ctx: DetectorContext): Promise<Detector[]> {
	const entriesFor = (task: "lint" | "build"): string[] =>
		enabledNames(ctx.config[task]).map((name) => (isPackageId(name) ? name : `${task}-${name}`));
	const entries = [
		...entriesFor("lint"),
		...entriesFor("build"),
		...(isTaskEnabled(ctx.config.release) ? ["release"] : []),
		...(ctx.config.test === true ? ["test"] : []),
	];
	const installed = [...new Set(entries.map((entry) => normalizeDetectorId(entry, ctx.hostPkg)).filter((id): id is string => id !== null))];

	const plugins = await loadPlugins(installed, {
		hostPkg: ctx.hostPkg,
		cwd: ctx.cwd,
		logger: ctx.logger,
	});
	return plugins.flatMap((p) => p.detectors);
}

/** A catalog plugin suggested for the host repository. */
export type Suggestion = {
	/** The short name to enable. */
	shortName: BuiltInShortName;
	/** The package to install. */
	pkg: string;
	/** Why it is suggested. */
	reason: string;
	/** Whether the host already depends on `pkg`. */
	installed: boolean;
	/** Packages the host must install itself for the plugin to run, such as `typescript`. */
	requires: string[];
};

/**
 * Build a list of "virtual" detector descriptors for built-in packages
 * that aren't installed yet but would match. Used by scan/init to show
 * suggestions before the user has installed them.
 */
export function virtualDetectors(fileTypes: Set<string>, hostPkg: PackageJson): Suggestion[] {
	const deps = { ...(hostPkg.dependencies ?? {}), ...(hostPkg.devDependencies ?? {}) };
	const matched = new Set<string>([...suggest(fileTypes), ...UNDETECTABLE_PLUGINS]);
	return PLUGIN_CATALOG.filter((entry) => matched.has(entry.shortName)).flatMap((entry) =>
		entry.packages.map((pkg) => ({
			shortName: entry.shortName,
			pkg,
			reason: "reason" in entry ? entry.reason : `Files matching ${entry.shortName} found in the committed tree.`,
			installed: pkg in deps,
			requires: "requires" in entry ? [...entry.requires] : [],
		})),
	);
}

export default {
	PACKAGE_HINTS,
	suggest,
	load,
	virtualDetectors,
};
