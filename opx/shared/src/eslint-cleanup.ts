import { existsSync, readFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { join } from "node:path";

import type { CleanupSuggestion, DetectorContext } from "@allons-y/opx";

/** The legacy ESLint config files that flat config replaces. */
const LEGACY_CONFIGS = [".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.mjs", ".eslintrc.yaml", ".eslintrc.yml"];

/** The flat config files. `@eslint/migrate-config` overwrites one of these if it is already there. */
const FLAT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts"];

/** What an ESLint plugin tells {@link eslintCleanup} about itself. */
export type EslintCleanupSpec = {
	/** The plugin's package name. */
	id: string;
	/** The plugin's short name, which keys its override in `.opx/config.json`. */
	shortName: string;
	/** The packages the plugin brings with it. */
	bundledDeps: readonly string[];
	/** The plugin's own `import.meta.url`, so each package resolves from where the plugin is installed. */
	from: string;
};

/**
 * Read the version of a package as the plugin resolves it.
 *
 * @param name - The package name.
 * @param from - A file URL inside the plugin.
 * @returns The version the plugin ships, or `undefined` if it can't be found.
 */
function shippedVersion(name: string, from: string): string | undefined {
	try {
		const path = findPackageJSON(name, from);
		return path ? (JSON.parse(readFileSync(path, "utf8")) as { version?: string }).version : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Suggest what a project can drop or update once an ESLint-based opx plugin is enabled.
 *
 * The plugin ships ESLint and its plugins at known versions, so a project's own
 * copies are redundant. Legacy config is not read by opx; the advice depends on
 * whether the project overrides the plugin's config. A suggestion does not mean
 * the thing exists; opx checks that before it says anything.
 *
 * @param ctx - The detector context.
 * @param spec - The plugin's name and bundled packages.
 * @returns The suggestions.
 */
export function eslintCleanup(ctx: DetectorContext, spec: EslintCleanupSpec): CleanupSuggestion[] {
	const override = ctx.config?.lint?.[spec.shortName];
	const notApplied = typeof override === "string" ? `opx lint uses ${override}, not this` : "opx lint uses its own config, not this";
	const where = typeof override === "string"
		? `Move any rules you still want into ${override}`
		: `Move any rules you still want into a flat config and point \`lint.${spec.shortName}\` at it in .opx/config.json`;
	const canMigrate = !FLAT_CONFIGS.some((name) => existsSync(join(ctx.cwd, name)));

	return [
		...spec.bundledDeps.map((name): CleanupSuggestion => {
			const version = shippedVersion(name, spec.from);
			return { kind: "dependency", target: name, reason: `bundled by ${spec.id}${version ? ` at ${version}` : ""}` };
		}),
		...LEGACY_CONFIGS.map((target): CleanupSuggestion => ({
			kind: "file",
			target,
			reason: notApplied,
			hint: canMigrate
				? `${where}, then delete it. The command writes eslint.config.mjs or .cjs beside it, with its own imports.`
				: `${where}, then delete it. A flat config already exists, so the migrate command is not offered because it would overwrite it.`,
			command: canMigrate ? { run: ["npx", "@eslint/migrate-config", target], description: "Convert it to a flat config" } : undefined,
		})),
		{
			kind: "file",
			target: ".eslintignore",
			reason: notApplied,
			hint: "Opx lints what git does not ignore; move any other patterns into an `ignores` entry in your override config, then delete it.",
		},
		{
			kind: "setting",
			target: "eslintConfig",
			reason: notApplied,
			hint: `${where}, then remove the key from package.json.`,
		},
		{
			kind: "setting",
			target: "eslintIgnore",
			reason: notApplied,
			hint: "Opx lints what git does not ignore; move any other patterns into an `ignores` entry in your override config, then remove the key from package.json.",
		},
	];
}
