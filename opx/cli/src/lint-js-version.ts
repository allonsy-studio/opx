import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PackageJson } from "@allons-y/opx";

/** The JavaScript lint plugin's package id. */
export const LINT_JS = "@allons-y/opx-lint-js";

/** The first `lint-js` range that leaves `.ts` files to `lint-ts`. */
export const LINT_JS_TS_FREE = "^1.0.0-beta.1";

/** The install spec that moves `lint-js` onto a JavaScript-only release. */
export const LINT_JS_UPGRADE = `${LINT_JS}@${LINT_JS_TS_FREE}`;

/**
 * Whether the host's `lint-js` is a 0.x release, which also lints TypeScript.
 *
 * Reads the installed version first, then falls back to the declared range.
 *
 * @param cwd - The repository root.
 * @param hostPkg - The host's `package.json`.
 * @returns `true` when `lint-js` would lint `.ts` files alongside `lint-ts`.
 */
export function lintJsLintsTypeScript(cwd: string, hostPkg: PackageJson): boolean {
	try {
		const installed = JSON.parse(readFileSync(join(cwd, "node_modules", ...LINT_JS.split("/"), "package.json"), "utf8")) as PackageJson;
		if (typeof installed.version === "string") return installed.version.startsWith("0.");
	} catch {
		// Not installed here; use the declared range.
	}
	const declared = hostPkg.devDependencies?.[LINT_JS] ?? hostPkg.dependencies?.[LINT_JS];
	return typeof declared === "string" && /^[~^]?0\./.test(declared);
}
