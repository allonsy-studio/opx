import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "./testing.js";

const scratch = useScratch();
const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

describe("useScratch", () => {
	let leftover: string[] = [];

	it("makes empty directories with a prefix", () => {
		const dir = scratch.dir("opx-prefix-");
		expect(existsSync(dir)).toBe(true);
		expect(dir).toContain("opx-prefix-");
		leftover = [dir, scratch.repo({ "a.txt": "x" })];
	});

	// Runs after the test above, which Jest guarantees within a file.
	it("removes everything a finished test made", () => {
		expect(leftover).toHaveLength(2);
		for (const path of leftover) expect(existsSync(path)).toBe(false);
	});

	it("makes a repository with no commits when given no files", () => {
		const repo = scratch.repo();
		expect(git(repo, "branch", "--show-current")).toBe("main");
		expect(() => git(repo, "rev-parse", "HEAD")).toThrow();
	});

	it("commits the files, including ones in new folders, on main", () => {
		const repo = scratch.repo({ "a.txt": "one", "deep/er/b.txt": "two" });
		expect(git(repo, "branch", "--show-current")).toBe("main");
		expect(git(repo, "ls-files").split("\n")).toEqual(["a.txt", "deep/er/b.txt"]);
		expect(readFileSync(join(repo, "deep/er/b.txt"), "utf8")).toBe("two");
		expect(git(repo, "status", "--porcelain")).toBe("");
	});

	it("commits even when there are no files, so HEAD exists", () => {
		expect(git(scratch.repo({}), "rev-parse", "--verify", "HEAD")).toMatch(/^[0-9a-f]{40}$/);
	});

	it("does not sign commits", () => {
		expect(git(scratch.repo({ "a": "x" }), "config", "commit.gpgsign")).toBe("false");
	});
});
