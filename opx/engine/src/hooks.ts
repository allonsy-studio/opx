import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The hook command. Runs the local binary directly, since starting through `npx` adds about a second. */
const POST_COMMIT_LINE = '( PATH="node_modules/.bin:$PATH" opx hook post-commit >/dev/null 2>&1 & ) || true';

const POST_COMMIT = `#!/usr/bin/env sh
${POST_COMMIT_LINE}
exit 0
`;

/** The outcome of {@link installPostCommitHook}. */
export type HookInstallResult = {
	/** Whether a new hook file was written, rather than found or extended. */
	created: boolean;
	/** The hook file's path. */
	path: string;
};

/**
 * Install the husky post-commit hook that nudges the user about new file types
 * after each commit. Runs in a backgrounded subshell and always exits 0, so it
 * never blocks the commit.
 */
export function installPostCommitHook(cwd: string): HookInstallResult {
	const dir = join(cwd, ".husky");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "post-commit");

	if (existsSync(path)) {
		const existing = readFileSync(path, "utf8");
		if (existing.includes("opx hook post-commit")) {
			return { created: false, path };
		}
		// Insert above a trailing top-level exit, which would otherwise stop our line from running.
		const lines = existing.trimEnd().split("\n");
		const at = /^exit(\s|$)/.test(lines.at(-1) ?? "") ? lines.length - 1 : lines.length;
		lines.splice(at, 0, POST_COMMIT_LINE);
		writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
		chmodSync(path, 0o755);
		return { created: false, path };
	}

	writeFileSync(path, POST_COMMIT, "utf8");
	chmodSync(path, 0o755);
	return { created: true, path };
}

/**
 * Add an entry to `.gitignore` unless it is already listed.
 *
 * @param cwd - The repository root.
 * @param entry - The pattern to ignore.
 * @returns true if `.gitignore` was changed.
 */
export function ensureGitignored(cwd: string, entry: string): boolean {
	const path = join(cwd, ".gitignore");
	const current = existsSync(path) ? readFileSync(path, "utf8") : "";
	const lines = current.split("\n");
	if (lines.includes(entry) || lines.includes(`${entry}/`)) return false;
	const next = `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${entry}\n`;
	writeFileSync(path, next, "utf8");
	return true;
}

/** `.gitignore` lines that hide the whole `.opx` folder, config included. */
const HIDES_OPX = new Set([".opx", ".opx/", ".opx/**"]);

/** Normalize a `.gitignore` line for comparison: trim it and drop a leading `/`. */
function pattern(line: string): string {
	return line.trim().replace(/^\/(?!\/)/, "");
}

/**
 * Ignore opx's local files while keeping `.opx/config.json` committable.
 *
 * Leaves `.gitignore` alone when `!.opx/config.json` follows the last `.opx/*`
 * and nothing hides the whole folder. Otherwise drops the opx lines and
 * appends `.opx/*` then `!.opx/config.json`.
 *
 * @returns true if `.gitignore` was changed.
 */
export function ensureOpxIgnored(cwd: string): boolean {
	const path = join(cwd, ".gitignore");
	const current = existsSync(path) ? readFileSync(path, "utf8") : "";
	const eol = current.includes("\r\n") ? "\r\n" : "\n";
	const lines = current.split(/\r?\n/);
	const patterns = lines.map(pattern);

	const ignoreAt = patterns.lastIndexOf(".opx/*");
	const keepAt = patterns.lastIndexOf("!.opx/config.json");
	if (ignoreAt !== -1 && keepAt > ignoreAt && !patterns.some((p) => HIDES_OPX.has(p))) return false;

	const kept = lines.filter((line) => {
		const p = pattern(line);
		return !HIDES_OPX.has(p) && p !== ".opx/*" && p !== "!.opx/config.json";
	});
	const base = kept.join(eol).replace(/(\r?\n)*$/, "");
	writeFileSync(path, [...(base ? [base] : []), ".opx/*", "!.opx/config.json", ""].join(eol), "utf8");
	return true;
}
