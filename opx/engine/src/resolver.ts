import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export type ResolvedTool = {
	source: "host" | "bundled";
	packagePath: string;
};

/**
 * Try to resolve a tool (e.g. "eslint") from the host project first; fall back
 * to the bundled copy that ships with the calling detector package.
 *
 * `bundledRequire` is created with `createRequire(import.meta.url)` inside the
 * detector package, so its resolution lookups start from the detector's own
 * node_modules tree.
 */
export function resolveTool(toolName: string, hostCwd: string, bundledRequire: NodeJS.Require): ResolvedTool {
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
