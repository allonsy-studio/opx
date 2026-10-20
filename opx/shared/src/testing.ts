import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Scratch directories for a test file. */
export type Scratch = {
	/**
	 * Make an empty directory.
	 *
	 * @param prefix - The start of its name.
	 * @returns Its path.
	 */
	dir(prefix?: string): string;
	/**
	 * Make a git repository on `main`.
	 *
	 * @param files - File paths to contents, committed together. Leave it out for a repository with no commits.
	 * @returns Its path.
	 */
	repo(files?: Record<string, string>): string;
};

/**
 * Make scratch directories and git repositories that are removed after each
 * test, even when the test fails. Call it once at the top of a test file.
 *
 * Git ignores the machine's own config under Jest (see `configs/jest.config.js`),
 * and commits here are unsigned.
 *
 * @returns The helpers.
 */
export function useScratch(): Scratch {
	const made: string[] = [];

	afterEach(() => {
		for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
	});

	const dir = (prefix = "opx-test-"): string => {
		const path = mkdtempSync(join(tmpdir(), prefix));
		made.push(path);
		return path;
	};

	const repo = (files?: Record<string, string>): string => {
		const path = dir("opx-repo-");
		const git = (...args: string[]): void => void execFileSync("git", args, { cwd: path, stdio: "ignore" });
		git("init", "-b", "main");
		git("config", "user.email", "t@t.io");
		git("config", "user.name", "t");
		git("config", "commit.gpgsign", "false");
		if (files) {
			for (const [name, content] of Object.entries(files)) {
				mkdirSync(dirname(join(path, name)), { recursive: true });
				writeFileSync(join(path, name), content);
			}
			git("add", ".");
			git("commit", "--allow-empty", "-m", "init");
		}
		return path;
	};

	return { dir, repo };
}
