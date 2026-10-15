import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { OpxConfig, PackageJson } from "@allons-y/opx";
import { detectPackageManager, enabledNames, uninstallCommand } from "@allons-y/opx";

import { PLUGIN_CATALOG, type PluginCatalogEntry } from "./plugin-catalog.js";

const CATALOG: readonly PluginCatalogEntry[] = PLUGIN_CATALOG;

/** Something cleanup can remove. */
export type Removal = {
	kind: "dependency" | "file" | "setting";
	/** The package name, file path, or `package.json` key. */
	target: string;
	/** Why it is safe to remove. */
	reason: string;
};

/** Something cleanup found but left alone. */
export type Kept = {
	target: string;
	/** Why it stays. */
	reason: string;
};

export type CleanupPlan = {
	removals: Removal[];
	kept: Kept[];
};

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "resolutions", "overrides"] as const;

/** Legacy ESLint config files. ESLint 9+ ignores them in favor of `eslint.config.js`. */
const LEGACY_ESLINT_FILES = [".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.mjs", ".eslintrc.yaml", ".eslintrc.yml"];

/** Ignore patterns the bundled flat configs already cover. */
const COVERED_IGNORES = new Set(["node_modules", "dist", "bin", ".yarn", ".opx"]);

/** Files read when looking for what still uses a package. */
const SCANNED = /\.(?:[cm]?[jt]sx?|json[c5]?|ya?ml|sh|vue|svelte|astro|njk)$/;
/** Files whose text can also invoke a tool by its command name. */
const COMMAND_FILES = /(?:^|\/)(?:package\.json|\.husky\/[^/]+|[^/]*lint-?staged[^/]*|[^/]+\.(?:ya?ml|sh))$/;
const MAX_SCAN_BYTES = 512 * 1024;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Lines of a `.eslintignore`-style list that the bundled configs do not already cover. */
function uncoveredIgnores(patterns: string[]): string[] {
	return patterns
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.filter((line) => !COVERED_IGNORES.has(line.replace(/^\/|^\*\*\//, "").replace(/\/(?:\*\*)?$/, "")));
}

/**
 * Whether a legacy `.eslintrc` object says nothing the bundled config does not.
 * Anything beyond `eslint:recommended`, Node and ES globals, and module syntax is the project's own.
 */
function isInertEslintrc(config: Record<string, unknown>): boolean {
	return Object.entries(config).every(([key, value]) => {
		if (key === "root" || key === "$schema") return true;
		if (key === "extends") return [value].flat().every((entry) => entry === "eslint:recommended");
		if (key === "env") return typeof value === "object" && value !== null && Object.keys(value).every((name) => /^(?:node|es\d+)$/.test(name));
		if (key === "parserOptions") {
			const options = (value ?? {}) as Record<string, unknown>;
			return Object.keys(options).every((name) => name === "ecmaVersion" || (name === "sourceType" && options.sourceType === "module"));
		}
		return false;
	});
}

/** Classify a legacy ESLint config file as empty-of-project-content (`null`) or the reason it stays. */
function legacyFileVerdict(cwd: string, name: string): string | null {
	const text = readFileSync(join(cwd, name), "utf8");
	if (name === ".eslintrc" || name.endsWith(".json")) {
		try {
			const parsed: unknown = JSON.parse(text);
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				return isInertEslintrc(parsed as Record<string, unknown>) ? null : "has rules or settings of its own";
			}
		} catch {
			// Not plain JSON (comments, YAML): fall through to the text check.
		}
	}
	const meaningful = text.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#") && !line.trim().startsWith("//") && line.trim() !== "---");
	return meaningful.length === 0 ? null : "has rules or settings of its own";
}

/** Tracked and untracked-but-not-ignored files, or `null` when git cannot list them. */
function listProjectFiles(cwd: string): string[] | null {
	try {
		const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
			maxBuffer: 64 * 1024 * 1024,
		});
		return out.toString("utf8").split("\0").filter(Boolean);
	} catch {
		return null;
	}
}

/** Whether a file is tracked and unchanged since `HEAD`, so deleting it loses nothing git cannot restore. */
function isRecoverable(cwd: string, file: string): boolean {
	try {
		execFileSync("git", ["ls-files", "--error-unmatch", "--", file], { cwd, stdio: "ignore" });
		return execFileSync("git", ["status", "--porcelain", "--", file], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() === "";
	} catch {
		return false;
	}
}

/** `package.json` text with its dependency sections dropped, so declaring a package is not "using" it. */
function withoutDependencies(text: string): string {
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		for (const field of DEPENDENCY_FIELDS) delete parsed[field];
		return JSON.stringify(parsed);
	} catch {
		return text;
	}
}

/**
 * Find which of the given packages the project still uses, as an import, a
 * config string, or (for `eslint`) a command in a script, hook, or workflow.
 *
 * @param skip - Files about to be removed, which do not count as use.
 * @returns A map of package to the first file that uses it.
 */
function findUses(cwd: string, files: string[], names: string[], skip: Set<string>): Map<string, string> {
	const found = new Map<string, string>();
	const importOf = (name: string) => new RegExp(String.raw`(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'\`]${escape(name)}(?:/[^"'\`]*)?["'\`]`);
	const quoted = (name: string) => new RegExp(String.raw`["']${escape(name)}(?:/[^"']*)?["']`);
	const command = (name: string) => new RegExp(String.raw`(?:^|[\s;&|"'\`/(])${escape(name)}(?=$|[\s;&|"'\`)])`, "m");

	for (const file of files) {
		if (skip.has(file) || !(SCANNED.test(file) || /(?:^|\/)\.husky\/[^/]+$/.test(file))) continue;
		if (/(?:^|\/)(?:node_modules|\.yarn)\//.test(file)) continue;
		const path = join(cwd, file);
		let text: string;
		try {
			if (statSync(path).size > MAX_SCAN_BYTES) continue;
			text = readFileSync(path, "utf8");
		} catch {
			continue;
		}
		if (file.endsWith("package.json")) text = withoutDependencies(text);
		const data = /\.(?:json[c5]?|ya?ml)$/.test(file);
		for (const name of names) {
			if (found.has(name)) continue;
			const used = importOf(name).test(text) || (data && quoted(name).test(text)) || (name === "eslint" && COMMAND_FILES.test(file) && command(name).test(text));
			if (used) found.set(name, file);
		}
	}
	return found;
}

/** The first package that lists `name` as a required peer, among the project's other dependencies. */
function requiredAsPeerBy(cwd: string, name: string, others: string[]): string | undefined {
	for (const other of others) {
		try {
			const pkg = JSON.parse(readFileSync(join(cwd, "node_modules", ...other.split("/"), "package.json"), "utf8")) as PackageJson & {
				peerDependenciesMeta?: Record<string, { optional?: boolean }>;
			};
			if (pkg.peerDependencies?.[name] && !pkg.peerDependenciesMeta?.[name]?.optional) return other;
		} catch {
			// Not installed, or unreadable: nothing to learn from it.
		}
	}
	return undefined;
}

/** The leading major version in a dependency range, or `undefined` when there is none. */
function majorOf(range: string | undefined): number | undefined {
	const match = range?.match(/\d+/);
	return match ? Number(match[0]) : undefined;
}

/**
 * Work out what is safe to clean up, without changing anything.
 *
 * Only plugins that are enabled and installed count, since only then does
 * something else provide what is being removed. A candidate is kept when the
 * project still uses it (an import, a config string, a command in a script,
 * hook, or workflow), when another dependency needs it as a peer, or, for a
 * config file, when it holds settings of the project's own.
 *
 * @param cwd - The repository root.
 * @param config - The `.opx/config.json` contents.
 * @param hostPkg - The host's current `package.json`.
 */
export function planCleanup(cwd: string, config: OpxConfig, hostPkg: PackageJson): CleanupPlan {
	const removals: Removal[] = [];
	const kept: Kept[] = [];
	const declared = { ...(hostPkg.dependencies ?? {}), ...(hostPkg.devDependencies ?? {}) };

	const active = CATALOG.filter((entry) => {
		const on = enabledNames(config.lint).includes(entry.shortName) || enabledNames(config.build).includes(entry.shortName);
		return on && entry.packages.every((pkg) => pkg in declared);
	});
	const bundled = [...new Set(active.flatMap((entry) => entry.bundles))].filter((name) => name in declared);
	const usesEslint = active.some((entry) => entry.bundles.includes("eslint"));
	if (active.length === 0) return { removals, kept };

	const files = listProjectFiles(cwd);
	const dropping = new Set<string>();

	// Config files and settings that only an old ESLint would read.
	const eslintRemovals: Removal[] = [];
	if (usesEslint) {
		const eslintMajor = majorOf(declared.eslint);
		const legacyLive = eslintMajor !== undefined && eslintMajor < 9;
		const legacy = (target: string, reason: string | null, kind: Removal["kind"], recoverable = true): void => {
			if (legacyLive) kept.push({ target, reason: `eslint ${declared.eslint} still reads it` });
			else if (reason) kept.push({ target, reason: `${reason}; move it into eslint.config.js, then delete it` });
			else if (!recoverable) kept.push({ target, reason: "has uncommitted changes; commit or stash it first" });
			else eslintRemovals.push({ kind, target, reason: "legacy ESLint config; flat config replaces it" });
		};

		for (const name of LEGACY_ESLINT_FILES) {
			if (!existsSync(join(cwd, name))) continue;
			legacy(name, legacyFileVerdict(cwd, name), "file", isRecoverable(cwd, name));
		}
		if (existsSync(join(cwd, ".eslintignore"))) {
			const extra = uncoveredIgnores(readFileSync(join(cwd, ".eslintignore"), "utf8").split("\n"));
			legacy(".eslintignore", extra.length > 0 ? `lists ${extra.length} pattern(s) of its own (${extra.slice(0, 3).join(", ")}${extra.length > 3 ? ", …" : ""})` : null, "file", isRecoverable(cwd, ".eslintignore"));
		}
		if (typeof hostPkg.eslintConfig === "object" && hostPkg.eslintConfig !== null) {
			legacy("package.json › eslintConfig", isInertEslintrc(hostPkg.eslintConfig as Record<string, unknown>) ? null : "has rules or settings of its own", "setting");
		}
		if (Array.isArray(hostPkg.eslintIgnore)) {
			const extra = uncoveredIgnores(hostPkg.eslintIgnore.map(String));
			legacy("package.json › eslintIgnore", extra.length > 0 ? `lists ${extra.length} pattern(s) of its own` : null, "setting");
		}
	}
	for (const removal of eslintRemovals) if (removal.kind === "file") dropping.add(removal.target);

	// Dependencies a plugin now bundles.
	if (bundled.length > 0 && files === null) {
		for (const name of bundled) kept.push({ target: name, reason: "could not list project files to check for use" });
	} else if (bundled.length > 0 && files !== null) {
		const uses = findUses(cwd, files, bundled, dropping);
		const strict = detectPackageManager(cwd, hostPkg) === "pnpm" || existsSync(join(cwd, ".pnp.cjs")) || existsSync(join(cwd, ".pnp.js"));

		let candidates = bundled.filter((name) => {
			const user = uses.get(name);
			if (user) kept.push({ target: name, reason: `used by ${user}` });
			else if (name === "eslint" && strict) kept.push({ target: name, reason: "this package manager does not expose the bundled copy to editors or a plain `eslint .`" });
			else return true;
			return false;
		});

		// A package that stays may need a candidate as a peer, which can in turn pull in more.
		for (;;) {
			const staying = Object.keys(declared).filter((name) => !candidates.includes(name));
			const blocked = candidates.flatMap((name) => {
				const by = requiredAsPeerBy(cwd, name, staying);
				return by ? [{ name, by }] : [];
			});
			if (blocked.length === 0) break;
			for (const { name, by } of blocked) kept.push({ target: name, reason: `required as a peer by ${by}` });
			candidates = candidates.filter((name) => !blocked.some((b) => b.name === name));
		}

		for (const name of candidates) {
			const plugin = active.find((entry) => entry.bundles.includes(name));
			removals.push({ kind: "dependency", target: name, reason: `bundled by ${plugin?.packages[0] ?? "an opx plugin"}` });
		}
	}

	return { removals: [...eslintRemovals, ...removals], kept };
}

/** Detect the indent a JSON file uses so a rewrite does not reformat it. */
function indentOf(text: string): string | number {
	return text.match(/^([ \t]+)"/m)?.[1] ?? 2;
}

/**
 * Carry out the chosen removals.
 *
 * Files are deleted, `package.json` keys are dropped in place with the file's
 * own indentation, and dependencies go through the package manager so the
 * lockfile stays in step.
 *
 * @param cwd - The repository root.
 * @param removals - The removals to apply, usually a subset of a plan.
 * @param run - Runs the package manager's remove command.
 */
export async function applyCleanup(cwd: string, removals: Removal[], run: (cmd: string, cwd: string) => Promise<void> | void): Promise<void> {
	for (const removal of removals.filter((r) => r.kind === "file")) {
		rmSync(join(cwd, removal.target), { force: true });
	}

	const keys = removals.filter((r) => r.kind === "setting").map((r) => r.target.replace("package.json › ", ""));
	if (keys.length > 0) {
		const path = join(cwd, "package.json");
		const text = readFileSync(path, "utf8");
		const pkg = JSON.parse(text) as Record<string, unknown>;
		for (const key of keys) delete pkg[key];
		writeFileSync(path, `${JSON.stringify(pkg, null, indentOf(text))}\n`, "utf8");
	}

	const names = removals.filter((r) => r.kind === "dependency").map((r) => r.target);
	if (names.length > 0) {
		const pm = detectPackageManager(cwd, JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as PackageJson);
		await run(uninstallCommand(pm, names), cwd);
	}
}
