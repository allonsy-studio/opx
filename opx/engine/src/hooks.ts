import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Prefer the installed binary: starting it through `npx` adds about a second.
const POST_COMMIT_LINE = '( opx=$([ -x node_modules/.bin/opx ] && echo node_modules/.bin/opx || echo "npx --no-install opx"); $opx hook post-commit >/dev/null 2>&1 & ) || true';

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
		// Append our line above any existing exit statements.
		const augmented = `${existing.trimEnd()}\n${POST_COMMIT_LINE}\n`;
		writeFileSync(path, augmented, "utf8");
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

/**
 * Ignore opx's local files while keeping `.opx/config.json` committable.
 *
 * Replaces a bare `.opx` / `.opx/` entry, which would also hide the config,
 * with `.opx/*` plus a `!.opx/config.json` exception.
 *
 * @returns true if `.gitignore` was changed.
 */
export function ensureOpxIgnored(cwd: string): boolean {
	const path = join(cwd, ".gitignore");
	const current = existsSync(path) ? readFileSync(path, "utf8") : "";
	const lines = current.split("\n");
	if (lines.includes(".opx/*") && lines.includes("!.opx/config.json")) return false;

	const kept = lines.filter((line) => line !== ".opx" && line !== ".opx/" && line !== ".opx/*" && line !== "!.opx/config.json");
	const base = kept.join("\n").replace(/\n*$/, "");
	const next = `${base}${base ? "\n" : ""}.opx/*\n!.opx/config.json\n`;
	writeFileSync(path, next, "utf8");
	return true;
}
