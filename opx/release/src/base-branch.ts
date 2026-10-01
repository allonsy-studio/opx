import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Resolve the `.git` directory, following the `gitdir:` pointer used by worktrees and submodules. */
function resolveGitDir(cwd: string): string | null {
	const dotGit = join(cwd, ".git");
	if (!existsSync(dotGit)) return null;
	if (statSync(dotGit).isDirectory()) return dotGit;
	const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
	return match?.[1] ? resolve(cwd, match[1].trim()) : null;
}

/** Whether a local branch exists, as a loose ref or in `packed-refs`. */
function hasBranch(gitDir: string, branch: string): boolean {
	if (existsSync(join(gitDir, "refs", "heads", branch))) return true;
	const packed = join(gitDir, "packed-refs");
	return existsSync(packed) && readFileSync(packed, "utf8").split("\n").some((line) => line.endsWith(` refs/heads/${branch}`));
}

/**
 * Work out the branch changesets should compare against.
 *
 * Prefers the remote's default branch (`origin/HEAD`), then a local `main` or
 * `master`, then the current branch, and falls back to `main`. Reads git's
 * files directly rather than spawning git.
 *
 * @param cwd - The repository root.
 * @returns A branch name.
 */
export function detectBaseBranch(cwd: string): string {
	const gitDir = resolveGitDir(cwd);
	if (!gitDir) return "main";

	const originHead = join(gitDir, "refs", "remotes", "origin", "HEAD");
	if (existsSync(originHead)) {
		const match = /^ref:\s*refs\/remotes\/origin\/(.+)$/m.exec(readFileSync(originHead, "utf8"));
		if (match?.[1]) return match[1].trim();
	}

	for (const candidate of ["main", "master"]) {
		if (hasBranch(gitDir, candidate)) return candidate;
	}

	const head = join(gitDir, "HEAD");
	if (existsSync(head)) {
		const match = /^ref:\s*refs\/heads\/(.+)$/m.exec(readFileSync(head, "utf8"));
		if (match?.[1]) return match[1].trim();
	}
	return "main";
}
