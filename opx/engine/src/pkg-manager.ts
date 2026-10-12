import { existsSync } from "node:fs";
import { join } from "node:path";

import type { PackageJson, PackageManager } from "./detector.js";

/**
 * Detect the host project's package manager.
 *
 * Priority:
 *   1. yarn.lock → "yarn"
 *   2. pnpm-lock.yaml → "pnpm"
 *   3. package-lock.json → "npm"
 *   4. packageManager field in package.json (e.g. "yarn@4.x")
 *   5. fallback "npm"
 */
export function detectPackageManager(cwd: string, hostPkg?: PackageJson): PackageManager {
	if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
	if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(cwd, "package-lock.json"))) return "npm";

	const pm = hostPkg?.packageManager;
	if (typeof pm === "string") {
		if (pm.startsWith("yarn")) return "yarn";
		if (pm.startsWith("pnpm")) return "pnpm";
		if (pm.startsWith("npm")) return "npm";
	}

	return "npm";
}

/**
 * Build the command that installs packages with a package manager.
 *
 * @param pm - The package manager to use.
 * @param packages - The packages to install.
 * @param opts - Install options.
 * @param opts.dev - Install as dev dependencies. Defaults to `true`.
 * @returns The command, or an empty string when there are no packages.
 */
export function installCommand(pm: PackageManager, packages: string[], opts: { dev?: boolean } = {}): string {
	const dev = opts.dev ?? true;
	if (packages.length === 0) return "";
	switch (pm) {
		case "yarn":
			return `yarn add ${dev ? "-D " : ""}${packages.join(" ")}`;
		case "pnpm":
			return `pnpm add ${dev ? "-D " : ""}${packages.join(" ")}`;
		case "npm":
		default:
			return `npm install ${dev ? "--save-dev " : ""}${packages.join(" ")}`;
	}
}
