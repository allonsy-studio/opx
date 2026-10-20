import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import type { CleanupSuggestion, Detector, DetectorContext, SuggestionCommand } from "@allons-y/opx";
import { uninstallCommand } from "@allons-y/opx";

/** A suggestion for the person to act on. */
export type CleanupAdvice = {
	/** The package, file, or `package.json` key. */
	target: string;
	reason: string;
	/** What to do about it. */
	hint?: string;
	/** A command the person can run. Opx prints it and never runs it. */
	command?: SuggestionCommand;
};

export type CleanupPlan = {
	/** Empty files that git can restore. This is the only thing opx deletes. */
	delete: string[];
	/** What the person should do themselves. */
	advice: CleanupAdvice[];
	/** Suggested packages the project still uses, or that removal would change elsewhere. */
	kept: Array<{ target: string; reason: string }>;
	/** Removes the suggested packages that appear unused, or empty when there are none. */
	command: string;
};

/** Files read when looking for what still uses a package. */
const SCANNED = /\.(?:[cm]?[jt]sx?|json[c5]?|ya?ml|sh|vue|svelte|astro|njk)$/;
/** Files whose text can also run a tool by its command name. */
const COMMAND_FILES = /(?:^|\/)(?:package\.json|\.husky\/[^/]+|[^/]*lint-?staged[^/]*|[^/]+\.(?:ya?ml|sh))$/;
/** Lockfiles name every installed package, so they say nothing about use. */
const LOCKFILES = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml)$/;
const MAX_SCAN_BYTES = 512 * 1024;
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "resolutions", "overrides"];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Whether text holds nothing but whitespace, comments, or an empty object. */
function isEmpty(text: string): boolean {
	const code = text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
		.join("")
		.replace(/\s/g, "");
	return code === "" || code === "{}";
}

/** Whether a path stays inside the repository. */
function isInside(cwd: string, target: string): boolean {
	return !isAbsolute(target) && !relative(cwd, join(cwd, target)).startsWith("..");
}

/** Whether a file is tracked and unchanged since `HEAD`, so git can restore it. */
function isRecoverable(cwd: string, file: string): boolean {
	try {
		execFileSync("git", ["ls-files", "--error-unmatch", "--", file], { cwd, stdio: "ignore" });
		return execFileSync("git", ["status", "--porcelain", "--", file], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() === "";
	} catch {
		return false;
	}
}

/** Whether a path is a regular file inside the repository with nothing in it. */
function isEmptyFile(cwd: string, target: string): boolean {
	const path = join(cwd, target);
	return isInside(cwd, target) && existsSync(path) && lstatSync(path).isFile() && isEmpty(readFileSync(path, "utf8"));
}

/** Whether opx may delete a file: empty, and restorable with git. */
function isDeletable(cwd: string, target: string): boolean {
	return isEmptyFile(cwd, target) && isRecoverable(cwd, target);
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

/** `package.json` text with its dependency sections dropped, so declaring a package is not using it. */
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
 * Find which packages the project still uses, as an import, a config string,
 * or a command in a script, hook, or workflow.
 *
 * @returns A map of package to the first file that uses it.
 */
function findUses(cwd: string, files: string[], names: string[]): Map<string, string> {
	const found = new Map<string, string>();
	const importOf = (name: string) => new RegExp(String.raw`(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'\`]${escape(name)}(?:/[^"'\`]*)?["'\`]`);
	const quoted = (name: string) => new RegExp(String.raw`["']${escape(name)}(?:/[^"']*)?["']`);
	const command = (name: string) => new RegExp(String.raw`(?:^|[\s;&|"'\`/(])${escape(name)}(?=$|[\s;&|"'\`)])`, "m");

	for (const file of files) {
		if (!(SCANNED.test(file) || /(?:^|\/)\.husky\/[^/]+$/.test(file)) || /(?:^|\/)(?:node_modules|\.yarn)\//.test(file) || LOCKFILES.test(file)) continue;
		let text: string;
		try {
			if (statSync(join(cwd, file)).size > MAX_SCAN_BYTES) continue;
			text = readFileSync(join(cwd, file), "utf8");
		} catch {
			continue;
		}
		if (file.endsWith("package.json")) text = withoutDependencies(text);
		const data = /\.(?:json[c5]?|ya?ml)$/.test(file);
		for (const name of names) {
			if (found.has(name)) continue;
			if (importOf(name).test(text) || (data && quoted(name).test(text)) || (COMMAND_FILES.test(file) && command(name).test(text))) found.set(name, file);
		}
	}
	return found;
}

/** An argument as typed in a shell, quoted only when it needs to be. */
function shellWord(word: string): string {
	return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

/** A plugin's command, if it is a non-empty list of strings. */
function validCommand(command: SuggestionCommand | undefined): SuggestionCommand | undefined {
	return Array.isArray(command?.run) && command.run.length > 0 && command.run.every((part) => typeof part === "string" && part !== "") ? command : undefined;
}

/** What a detector suggests, or nothing if it has no suggestions or fails. */
function suggestionsOf(detector: Detector, ctx: DetectorContext): CleanupSuggestion[] {
	try {
		return detector.cleanup?.(ctx) ?? [];
	} catch {
		return [];
	}
}

/**
 * Work out what the enabled plugins suggest the project drop, without changing anything.
 *
 * The plugins only suggest; this decides what happens. A file is deleted only
 * when it is empty and git can restore it. Everything else, including every
 * package and every `package.json` key, is advice for the person to act on.
 * Packages are suggested only if listed as a dev dependency and nowhere else,
 * and only if nothing in the project appears to use them.
 *
 * @param ctx - The detector context.
 * @param detectors - The enabled plugins' detectors.
 */
export function planCleanup(ctx: DetectorContext, detectors: Detector[]): CleanupPlan {
	const plan: CleanupPlan = { delete: [], advice: [], kept: [], command: "" };
	const seen = new Set<string>();
	const packages: CleanupSuggestion[] = [];

	for (const suggestion of detectors.flatMap((detector) => suggestionsOf(detector, ctx))) {
		const key = `${suggestion.kind}:${suggestion.target}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const { target, reason, hint } = suggestion;
		const command = validCommand(suggestion.command);
		if (suggestion.kind === "dependency") {
			packages.push(suggestion);
		} else if (suggestion.kind === "setting") {
			if (ctx.hostPkg[target] !== undefined) plan.advice.push({ target: `package.json › ${target}`, reason, hint, command });
		} else if (isInside(ctx.cwd, target) && existsSync(join(ctx.cwd, target))) {
			if (isDeletable(ctx.cwd, target)) plan.delete.push(target);
			else if (isEmptyFile(ctx.cwd, target)) plan.advice.push({ target, reason: `${reason}; it is empty, so commit or stash it and opx can delete it` });
			else plan.advice.push({ target, reason, hint, command });
		}
	}

	planPackages(ctx, packages, plan);
	return plan;
}

/** Sort suggested packages into advice, or kept when the project still needs them. */
function planPackages(ctx: DetectorContext, packages: CleanupSuggestion[], plan: CleanupPlan): void {
	const host = ctx.hostPkg as Record<string, Record<string, string> | undefined>;
	const eligible: CleanupSuggestion[] = [];

	for (const suggestion of packages) {
		if (!host.devDependencies?.[suggestion.target]) continue;
		const field = ["dependencies", "peerDependencies", "optionalDependencies"].find((name) => host[name]?.[suggestion.target]);
		if (field) plan.kept.push({ target: suggestion.target, reason: `also listed under ${field}, which removing it would change` });
		else eligible.push(suggestion);
	}
	if (eligible.length === 0) return;

	const files = listProjectFiles(ctx.cwd);
	if (files === null) {
		for (const { target } of eligible) plan.kept.push({ target, reason: "could not list the project's files to check for use" });
		return;
	}

	const uses = findUses(ctx.cwd, files, eligible.map((s) => s.target));
	const unused = eligible.filter((s) => !uses.has(s.target));
	for (const { target } of eligible) if (uses.has(target)) plan.kept.push({ target, reason: `used by ${uses.get(target)}` });
	for (const { target, reason, hint } of unused) plan.advice.push({ target, reason: `${reason}; nothing else appears to use it`, hint });
	plan.command = uninstallCommand(ctx.pkgManager, unused.map((s) => s.target));
}

/**
 * Delete the given files, skipping any that are no longer empty and restorable.
 *
 * @param cwd - The repository root.
 * @param paths - Paths from the repository root, usually {@link CleanupPlan.delete}.
 * @returns The paths that were deleted.
 */
export function applyCleanup(cwd: string, paths: string[]): string[] {
	const deleted: string[] = [];
	for (const path of paths) {
		if (!isDeletable(cwd, path)) continue;
		rmSync(join(cwd, path));
		deleted.push(path);
	}
	return deleted;
}

/**
 * Describe a plan as lines of text for the terminal.
 *
 * @param plan - The plan to describe.
 */
export function describePlan(plan: CleanupPlan): string[] {
	const lines: string[] = [];
	if (plan.delete.length > 0) {
		lines.push("Empty files that git can restore:");
		for (const path of plan.delete) lines.push(`  - ${path}`);
	}
	if (plan.advice.length > 0) {
		lines.push("Suggested by your plugins (for you to do):");
		for (const { target, reason, hint, command } of plan.advice) {
			lines.push(`  - ${target}: ${reason}`);
			if (hint) lines.push(`      ${hint}`);
			if (command) lines.push(`      Run: ${command.run.map(shellWord).join(" ")}${command.description ? ` (${command.description})` : ""}`);
		}
	}
	if (plan.command) lines.push(`Drop the unused packages with: ${plan.command}`);
	if (plan.kept.length > 0) {
		lines.push("Keeping:");
		for (const { target, reason } of plan.kept) lines.push(`  - ${target}: ${reason}`);
	}
	return lines;
}
