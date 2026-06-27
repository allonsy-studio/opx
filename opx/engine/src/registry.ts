import type { Detector, Logger, PackageJson } from "./detector.js";

const OFFICIAL_PREFIX = "@allons-y/opx-";
const COMMUNITY_PREFIX = "opx-plugin-";

const NAME_RE = new RegExp("^(opx-plugin-|@[^/]+/opx-plugin-|@allons-y/opx-)");

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

export type LoadedPlugin = {
	id: string;
	shortName: string;
	detectors: Detector[];
};

export type LoadOptions = {
	hostPkg: PackageJson;
	cwd: string;
	logger: Logger;
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
	const { hostPkg, logger } = options;
	const loaded: LoadedPlugin[] = [];

	for (const entry of entries) {
		const candidates = resolvePluginPackageName(entry);
		const installed = normalizeDetectorId(entry, hostPkg);

		if (!installed) {
			logger.warn(
				`opx: "${entry}" is declared in .opx/config.json but no matching package is installed. Tried: ${candidates.join(", ")}. Install one of those packages to enable this detector.`,
			);
			continue;
		}

		if (!isValidPluginName(installed)) {
			logger.warn(
				`opx: package "${installed}" does not follow the opx plugin naming convention (opx-plugin-*, @scope/opx-plugin-*, or @allons-y/opx-*). Skipped.`,
			);
			continue;
		}

		try {
			const mod = (await import(installed)) as { default?: Detector | Detector[] };
			const def = mod.default;
			const detectors: Detector[] = Array.isArray(def) ? def : def ? [def] : [];
			if (detectors.length === 0) {
				logger.warn(`opx: "${installed}" did not export a default Detector. Skipped.`);
				continue;
			}
			loaded.push({ id: installed, shortName: entry, detectors });
		} catch (err) {
			logger.warn(`opx: failed to import "${installed}": ${(err as Error).message}`);
		}
	}

	return loaded;
}
