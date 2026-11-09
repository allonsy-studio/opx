import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "./testing.js";

const scratch = useScratch();
const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

describe("useScratch", () => {
	it("makes empty directories with a prefix", () => {
		const dir = scratch.dir("opx-prefix-");
		expect(existsSync(dir)).toBe(true);
		expect(dir).toContain("opx-prefix-");
	});

	describe("cleanup", () => {
		const made: string[] = [];

		it("keeps what a test made until the test finishes", () => {
			made.push(scratch.dir(), scratch.repo({ "a.txt": "x" }));
			for (const path of made) expect(existsSync(path)).toBe(true);
		});

		/** Runs after the file-level afterEach, so it sees the cleanup whichever tests ran. */
		afterAll(() => {
			for (const path of made) expect(existsSync(path)).toBe(false);
		});
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
