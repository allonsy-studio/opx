import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectBaseBranch } from "./base-branch.js";

/** Create a throwaway directory with a fake `.git` populated by the caller. */
function repo(populate: (gitDir: string) => void = () => {}): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-base-"));
	const gitDir = join(dir, ".git");
	mkdirSync(gitDir, { recursive: true });
	populate(gitDir);
	return dir;
}

function write(path: string, contents: string): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, contents);
}

describe("detectBaseBranch", () => {
	const dirs: string[] = [];
	const make = (populate?: (gitDir: string) => void): string => {
		const dir = repo(populate);
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("falls back to main outside a git repository", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-nogit-"));
		dirs.push(dir);
		expect(detectBaseBranch(dir)).toBe("main");
	});

	it("prefers the remote's default branch", () => {
		const dir = make((git) => {
			write(join(git, "refs", "remotes", "origin", "HEAD"), "ref: refs/remotes/origin/trunk\n");
			write(join(git, "refs", "heads", "main"), "abc\n");
		});
		expect(detectBaseBranch(dir)).toBe("trunk");
	});

	it("uses a local main, then master", () => {
		expect(detectBaseBranch(make((git) => write(join(git, "refs", "heads", "main"), "abc\n")))).toBe("main");
		expect(detectBaseBranch(make((git) => write(join(git, "refs", "heads", "master"), "abc\n")))).toBe("master");
	});

	it("prefers main when both main and master exist", () => {
		const dir = make((git) => {
			write(join(git, "refs", "heads", "master"), "abc\n");
			write(join(git, "refs", "heads", "main"), "abc\n");
		});
		expect(detectBaseBranch(dir)).toBe("main");
	});

	it("finds branches that only exist in packed-refs", () => {
		const dir = make((git) => write(join(git, "packed-refs"), "# pack-refs\nabc123 refs/heads/master\n"));
		expect(detectBaseBranch(dir)).toBe("master");
	});

	it("uses the current branch when there is no main or master", () => {
		const dir = make((git) => write(join(git, "HEAD"), "ref: refs/heads/develop\n"));
		expect(detectBaseBranch(dir)).toBe("develop");
	});

	it("falls back to main for a detached HEAD", () => {
		const dir = make((git) => write(join(git, "HEAD"), "0123456789abcdef\n"));
		expect(detectBaseBranch(dir)).toBe("main");
	});

	it("follows a gitdir pointer, as used by worktrees", () => {
		const real = make((git) => write(join(git, "refs", "heads", "master"), "abc\n"));
		const worktree = mkdtempSync(join(tmpdir(), "opx-wt-"));
		dirs.push(worktree);
		writeFileSync(join(worktree, ".git"), `gitdir: ${join(real, ".git")}\n`);
		expect(detectBaseBranch(worktree)).toBe("master");
	});

	it("falls back to main when the gitdir pointer is unreadable", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-bad-"));
		dirs.push(dir);
		writeFileSync(join(dir, ".git"), "garbage\n");
		expect(detectBaseBranch(dir)).toBe("main");
	});
});
