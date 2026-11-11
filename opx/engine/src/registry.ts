import type { Detector, Logger, PackageJson } from "./detector.js";
import { resolvePackageEntry } from "./resolver.js";

const OFFICIAL_PREFIX = "@allons-y/opx-";
const COMMUNITY_PREFIX = "opx-plugin-";

const NAME_RE = new RegExp("^(opx-plugin-|@[^/]+/opx-plugin-|@allons-y/opx-)");

/**
 * Whether a package name follows the opx plugin naming convention:
 * `@allons-y/opx-*`, `opx-plugin-*`, or `@scope/opx-plugin-*`.
 *
 * @param name - The package name to check.
 */
export function isValidPluginName(name: string): boolean {
	return NAME_RE.test(name);
}

/**
 * Resolve a short slug or fully-qualified package name to a candidate ordered
 * list of package ids to try. The first one that exists in the host's deps wins.
 */
export function resolvePluginPackageName(
	entry: string,
): string[] {
	if (entry.startsWith("@") || entry.startsWith(COMMUNITY_PREFIX)) {
		return [entry];
	}
	return [
		`${OFFICIAL_PREFIX}${entry}`,
		`${COMMUNITY_PREFIX}${entry}`,
	];
}

/**
 * Normalize a detector reference (short or full) to a canonical package id by
 * checking the host's dependencies. Returns null if no candidate is installed.
 */
export function normalizeDetectorId(
	entry: string,
	hostPkg: PackageJson,
): string | null {
	const deps = {
		...(hostPkg.dependencies ?? {}),
		...(hostPkg.devDependencies ?? {}),
	};
	for (const candidate of resolvePluginPackageName(entry)) {
		if (candidate in deps) return candidate;
	}
	return null;
}

/** A plugin package that loaded successfully. */
export type LoadedPlugin = {
	/** The installed package id. */
	id: string;
	/** The short name it was declared with in config. */
	shortName: string;
	/** The detectors its default export provides. */
	detectors: Detector[];
};

/** Options for {@link loadPlugins}. */
export type LoadOptions = {
	/** The host project's `package.json`, used to find installed plugins. */
	hostPkg: PackageJson;
	/** The repository root. */
	cwd: string;
	/** Where to report plugins that are skipped, unless `onSkip` is given. */
	logger: Logger;
	/** Called instead of `logger.warn` for each plugin that is skipped, with why. */
	onSkip?: (entry: string, reason: string) => void;
};

/**
 * Dynamically load plugin packages declared in the concern array. Enforces:
 *   1. The fully-qualified package id matches the official/community naming pattern.
 *   2. The package is present in the host's deps/devDeps (warn + skip otherwise).
 *
 * Returns the loaded plugins in declaration order. Plugins whose default export
 * isn't a Detector (or Detector[]) are skipped with a warning.
 */
export async function loadPlugins(
	entries: string[],
	options: LoadOptions,
): Promise<LoadedPlugin[]> {
	const { hostPkg, cwd, logger } = options;
	const skip = options.onSkip ?? ((_entry: string, reason: string) => logger.warn(`opx: ${reason}`));
	const loaded: LoadedPlugin[] = [];

	for (const entry of entries) {
		const candidates = resolvePluginPackageName(entry);
		const installed = normalizeDetectorId(entry, hostPkg);

		if (!installed) {
			skip(entry, `"${entry}" is declared in .opx/config.json but no matching package is installed. Tried: ${candidates.join(", ")}. Install one of those packages to enable this detector.`);
			continue;
		}

		if (!isValidPluginName(installed)) {
			skip(entry, `package "${installed}" does not follow the opx plugin naming convention (opx-plugin-*, @scope/opx-plugin-*, or @allons-y/opx-*). Skipped.`);
			continue;
		}

		try {
			// Resolve from the host project, not from wherever the engine is installed.
			const mod = (await import(resolvePackageEntry(installed, cwd) ?? installed)) as { default?: Detector | Detector[] };
			const def = mod.default;
			const detectors: Detector[] = Array.isArray(def) ? def : def ? [def] : [];
			if (detectors.length === 0) {
				skip(entry, `"${installed}" did not export a default Detector. Skipped.`);
				continue;
			}
			loaded.push({ id: installed, shortName: entry, detectors });
		} catch (err) {
			skip(entry, `failed to import "${installed}": ${(err as Error).message}`);
		}
	}

	return loaded;
}
