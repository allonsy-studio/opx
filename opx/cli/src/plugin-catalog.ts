/**
 * The canonical catalog of official opx plugins — the single source of truth
 * for which short names exist, which packages provide them, and which file
 * extensions imply them.
 *
 * The lookup tables and helpers in built-in.ts (supported extensions,
 * undetectable plugins, package hints, file-type suggestion) are all *derived*
 * from this list, so onboarding a new official plugin is a one-line change here
 * rather than an edit across several parallel constants.
 */
export type PluginCatalogEntry = {
	/** Short name used in `.opx/config.json` and on the CLI (e.g. "js"). */
	readonly shortName: string;
	/** Packages that provide this short name, across concerns (lint, build, …). */
	readonly packages: readonly string[];
	/**
	 * File extensions (with leading dot) whose presence in the committed tree
	 * implies this plugin. Empty for plugins that can't be detected from files
	 * alone (e.g. `release`, `test`).
	 */
	readonly extensions: readonly string[];
};

/**
 * Only plugins that are actually published belong here; listing an unreleased
 * package would make `scan`/`init` suggest an install that 404s.
 */
export const PLUGIN_CATALOG = [
	{
		shortName: "js",
		packages: ["@allons-y/opx-lint-js"],
		extensions: [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"],
	},
	{
		shortName: "md",
		packages: ["@allons-y/opx-lint-md"],
		extensions: [".md", ".mdx"],
	},
	{
		shortName: "json",
		packages: ["@allons-y/opx-lint-json"],
		extensions: [".json", ".jsonc", ".json5"],
	},
	{
		shortName: "release",
		packages: ["@allons-y/opx-release"],
		extensions: [],
	},
] as const satisfies readonly PluginCatalogEntry[];

/** Every short name known to the catalog (e.g. "js" | "ts" | … | "release"). */
export type BuiltInShortName = (typeof PLUGIN_CATALOG)[number]["shortName"];

/** Tasks configured as booleans rather than keyed plugin maps. */
export const STATIC_TASKS = ["release", "test"] as const;

export type TaskKind = "lint" | "build";

/** Whether a name refers to a static (boolean) task. */
export function isStaticTask(name: string): name is (typeof STATIC_TASKS)[number] {
	return (STATIC_TASKS as readonly string[]).includes(name);
}

/** Whether a short name has a published package in the catalog. */
export function isShipped(name: string): boolean {
	return PLUGIN_CATALOG.some((entry) => entry.shortName === name);
}

/**
 * Dynamic tasks a catalog plugin provides, derived from its package names
 * (`opx-lint-*` → lint, `opx-build-*` → build). Unknown names get both.
 */
export function tasksFor(name: string): TaskKind[] {
	const entry = PLUGIN_CATALOG.find((e) => e.shortName === name);
	if (!entry) return ["lint", "build"];
	const tasks: TaskKind[] = [];
	if (entry.packages.some((pkg) => pkg.includes("/opx-lint-"))) tasks.push("lint");
	if (entry.packages.some((pkg) => pkg.includes("/opx-build-"))) tasks.push("build");
	return tasks;
}
