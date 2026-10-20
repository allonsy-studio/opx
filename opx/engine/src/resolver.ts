import { createRequire } from "node:module";
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
