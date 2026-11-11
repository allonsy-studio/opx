import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Where a tool was found. */
export type ResolvedTool = {
	/** Whether the host project or the detector's own copy supplied it. */
	source: "host" | "bundled";
	/** Absolute path to the tool's `package.json`. */
	packagePath: string;
};

/**
 * Try to resolve a tool (e.g. "eslint") from the host project first; fall back
 * to the bundled copy that ships with the calling detector package.
 *
 * `bundledRequire` is created with `createRequire(import.meta.url)` inside the
 * detector package, so its resolution lookups start from the detector's own
 * node_modules tree. Only its `resolve` is used, so any object with one works.
 */
export function resolveTool(toolName: string, hostCwd: string, bundledRequire: { resolve(request: string): string }): ResolvedTool {
	const hostRequire = createRequire(pathToFileURL(`${hostCwd}/__opx_resolve__`));
	try {
		const packagePath = hostRequire.resolve(`${toolName}/package.json`);
		return { source: "host", packagePath };
	} catch {
		// fall through
	}
	const packagePath = bundledRequire.resolve(`${toolName}/package.json`);
	return { source: "bundled", packagePath };
}

/** The conditions Node matches for an `import`, in its own order of preference. */
const IMPORT_CONDITIONS = new Set(["node", "import", "default"]);

/** Pick the target of an `exports` value for an `import`, following nested conditions. */
function exportTarget(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		for (const item of value) {
			const target = exportTarget(item);
			if (target) return target;
		}
		return undefined;
	}
	if (value && typeof value === "object") {
		for (const [key, inner] of Object.entries(value)) {
			if (!IMPORT_CONDITIONS.has(key)) continue;
			const target = exportTarget(inner);
			if (target) return target;
		}
	}
	return undefined;
}

/** The entry an `import` of the package root loads, relative to the package folder. */
export function packageEntry(manifest: { exports?: unknown; main?: unknown }): string {
	const { exports } = manifest;
	if (exports !== undefined && exports !== null) {
		const root = typeof exports === "object" && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith(".")) ? (exports as Record<string, unknown>)["."] : exports;
		const target = exportTarget(root);
		if (target) return target;
	}
	return typeof manifest.main === "string" ? manifest.main : "index.js";
}

/**
 * Find an installed package from the host project, the way Node searches
 * `node_modules` folders from `cwd` upward, and return its `import` entry as a
 * file URL. Returns `undefined` when no `node_modules` copy exists, such as
 * under Yarn Plug'n'Play.
 *
 * @param name - The package name, such as `@allons-y/opx-lint-js`.
 * @param cwd - The host project directory to search from.
 */
export function resolvePackageEntry(name: string, cwd: string): string | undefined {
	for (let dir = resolve(cwd); ; dir = dirname(dir)) {
		const manifestPath = join(dir, "node_modules", name, "package.json");
		if (existsSync(manifestPath)) {
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: unknown; main?: unknown };
			return pathToFileURL(join(dirname(manifestPath), packageEntry(manifest))).href;
		}
		if (dirname(dir) === dir) return undefined;
	}
}
