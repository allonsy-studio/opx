import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PackageJson, PackageManager } from "./detector.js";

/** Lockfiles, in the order used to break a tie between managers. */
const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
	["yarn.lock", "yarn"],
	["pnpm-lock.yaml", "pnpm"],
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["package-lock.json", "npm"],
	["npm-shrinkwrap.json", "npm"],
];

/** Environment variables by name, without depending on the `NodeJS` global from `@types/node`. */
export type Environment = Record<string, string | undefined>;

/** What {@link inspectPackageManager} found. */
export type PackageManagerInfo = {
	/** The package manager to use. */
	name: PackageManager;
	/** False when the project points at more than one manager, so running a command could use the wrong one. */
	certain: boolean;
	/** Where the answer came from, or what conflicts. */
	reason: string;
	/** Whether the project root is a workspace root, where adding a package needs an extra flag on pnpm and Yarn Classic. */
	workspaceRoot: boolean;
	/** Whether the manager is Yarn Classic (v1), which takes different flags than Yarn 2+. */
	yarnClassic: boolean;
};

/** Pick a known manager out of text such as `yarn@4.1.0` or `pnpm/9.0.0 npm/?`. */
function managerIn(text: unknown): PackageManager | undefined {
	return typeof text === "string" ? (text.match(/^(npm|yarn|pnpm|bun)[@/]/)?.[1] as PackageManager | undefined) : undefined;
}

/** Read a `package.json`, or `{}` if there is none. */
function readPackage(dir: string): PackageJson {
	try {
		return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
	} catch {
		return {};
	}
}

/**
 * Find the nearest directory, from the project up to the repository root, that
 * names a package manager by its `packageManager` field or a lockfile. Stops at
 * the repository root so a stray lockfile in a parent folder is never used.
 */
function findSignals(cwd: string, hostPkg: PackageJson): { dir: string; field?: PackageManager; fieldText?: string; lockfiles: PackageManager[] } {
	let dir = cwd;
	let pkg = hostPkg;
	for (;;) {
		const fieldText = typeof pkg.packageManager === "string" ? pkg.packageManager : undefined;
		const field = managerIn(fieldText);
		const lockfiles = LOCKFILES.filter(([file]) => existsSync(join(dir, file))).map(([, name]) => name);
		if (field || lockfiles.length > 0) return { dir, field, fieldText, lockfiles };
		if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return { dir: cwd, lockfiles: [] };
		dir = dirname(dir);
		pkg = readPackage(dir);
	}
}

/**
 * Work out the host project's package manager, and how sure that is.
 *
 * An explicit `packageManager` field wins over lockfiles, and a single lockfile
 * wins over how opx was launched. If both name different managers, or several
 * lockfiles are present, the answer is marked uncertain so callers can show a
 * command instead of running it.
 *
 * Order: `packageManager` field, then lockfiles, then the launching manager
 * (`npm_config_user_agent`), then `npm`. The launcher ranks last because
 * `npx` reports `npm` whatever the project uses.
 *
 * @param cwd - The project directory.
 * @param hostPkg - The project's `package.json`.
 * @param env - The environment to read the launcher from.
 */
export function inspectPackageManager(cwd: string, hostPkg: PackageJson = {}, env: Environment = process.env): PackageManagerInfo {
	const { dir, field, fieldText, lockfiles } = findSignals(cwd, hostPkg);
	const launcher = managerIn(env.npm_config_user_agent);
	const distinct = [...new Set(lockfiles)];

	let found: Pick<PackageManagerInfo, "name" | "certain" | "reason">;
	if (field) {
		const others = distinct.filter((name) => name !== field);
		found = { name: field, certain: others.length === 0, reason: others.length === 0 ? "packageManager field" : `packageManager says ${field}, but there is also a ${others.join(" and ")} lockfile` };
	} else if (distinct.length === 1) {
		found = { name: distinct[0]!, certain: true, reason: `${distinct[0]} lockfile` };
	} else if (distinct.length > 1) {
		found = { name: launcher && distinct.includes(launcher) ? launcher : distinct[0]!, certain: false, reason: `lockfiles for ${distinct.join(" and ")}` };
	} else if (launcher) {
		found = { name: launcher, certain: true, reason: `run through ${launcher}` };
	} else {
		found = { name: "npm", certain: true, reason: "default" };
	}

	const berry = existsSync(join(dir, ".yarnrc.yml")) || Number(fieldText?.match(/^yarn@(\d+)/)?.[1]) >= 2;
	return {
		...found,
		workspaceRoot: existsSync(join(cwd, "pnpm-workspace.yaml")) || Boolean(hostPkg.workspaces),
		yarnClassic: found.name === "yarn" && !berry,
	};
}

/**
 * Detect the host project's package manager. See {@link inspectPackageManager}
 * for the order and for how sure the answer is.
 *
 * @param cwd - The project directory.
 * @param hostPkg - The project's `package.json`.
 * @param env - The environment to read the launcher from.
 */
export function detectPackageManager(cwd: string, hostPkg?: PackageJson, env: Environment = process.env): PackageManager {
	return inspectPackageManager(cwd, hostPkg, env).name;
}

/** Options for {@link installCommand}. */
export type InstallOptions = {
	/** Install as dev dependencies. Defaults to `true`. */
	dev?: boolean;
	/** The project root is a workspace root, which pnpm and Yarn Classic need told. */
	workspaceRoot?: boolean;
	/** The manager is Yarn Classic. */
	yarnClassic?: boolean;
};

/**
 * Build the command that installs packages with a package manager.
 *
 * @param pm - The package manager to use.
 * @param packages - The packages to install.
 * @param opts - Install options.
 * @returns The command, or an empty string when there are no packages.
 */
export function installCommand(pm: PackageManager, packages: string[], opts: InstallOptions = {}): string {
	const dev = opts.dev ?? true;
	if (packages.length === 0) return "";
	switch (pm) {
		case "yarn":
			return `yarn add ${dev ? "-D " : ""}${opts.workspaceRoot && opts.yarnClassic ? "-W " : ""}${packages.join(" ")}`;
		case "pnpm":
			return `pnpm add ${dev ? "-D " : ""}${opts.workspaceRoot ? "-w " : ""}${packages.join(" ")}`;
		case "bun":
			return `bun add ${dev ? "-d " : ""}${packages.join(" ")}`;
		case "npm":
		default:
			return `npm install ${dev ? "--save-dev " : ""}${packages.join(" ")}`;
	}
}

/**
 * Build the command that removes packages with a package manager.
 *
 * @param pm - The package manager to use.
 * @param packages - The packages to remove.
 * @returns The command, or an empty string when there are no packages.
 */
export function uninstallCommand(pm: PackageManager, packages: string[]): string {
	if (packages.length === 0) return "";
	switch (pm) {
		case "yarn":
			return `yarn remove ${packages.join(" ")}`;
		case "pnpm":
			return `pnpm remove ${packages.join(" ")}`;
		case "bun":
			return `bun remove ${packages.join(" ")}`;
		case "npm":
		default:
			return `npm uninstall ${packages.join(" ")}`;
	}
}
