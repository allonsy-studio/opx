import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const POST_COMMIT = `#!/usr/bin/env sh
( npx --no-install opx hook post-commit >/dev/null 2>&1 & ) || true
exit 0
`;

export type HookInstallResult = {
	created: boolean;
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
		const augmented = `${existing.trimEnd()}\n( npx --no-install opx hook post-commit >/dev/null 2>&1 & ) || true\n`;
		writeFileSync(path, augmented, "utf8");
		chmodSync(path, 0o755);
		return { created: false, path };
	}

	writeFileSync(path, POST_COMMIT, "utf8");
	chmodSync(path, 0o755);
	return { created: true, path };
}

export function ensureGitignored(cwd: string, entry: string): boolean {
	const path = join(cwd, ".gitignore");
	const current = existsSync(path) ? readFileSync(path, "utf8") : "";
	const lines = current.split("\n");
	if (lines.includes(entry) || lines.includes(`${entry}/`)) return false;
	const next = `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${entry}\n`;
	writeFileSync(path, next, "utf8");
	return true;
}
