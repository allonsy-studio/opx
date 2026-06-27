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

export const PLUGIN_CATALOG = [
	{
		shortName: "js",
		packages: ["@allons-y/opx-lint-js", "@allons-y/opx-build-js"],
		extensions: [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"],
	},
	{
		shortName: "ts",
		packages: ["@allons-y/opx-lint-ts", "@allons-y/opx-build-ts"],
		extensions: [".ts", ".tsx"],
	},
	{
		shortName: "css",
		packages: ["@allons-y/opx-lint-css", "@allons-y/opx-build-css"],
		extensions: [".css"],
	},
	{
		shortName: "md",
		packages: ["@allons-y/opx-lint-md", "@allons-y/opx-build-md"],
		extensions: [".md", ".mdx"],
	},
	{
		shortName: "json",
		packages: ["@allons-y/opx-lint-json", "@allons-y/opx-build-json"],
		extensions: [".json", ".jsonc", ".json5"],
	},
	{
		shortName: "release",
		packages: ["@allons-y/opx-release"],
		extensions: [],
	},
	{
		shortName: "test",
		packages: ["@allons-y/opx-test"],
		extensions: [],
	},
] as const satisfies readonly PluginCatalogEntry[];

/** Every short name known to the catalog (e.g. "js" | "ts" | … | "release"). */
export type BuiltInShortName = (typeof PLUGIN_CATALOG)[number]["shortName"];
