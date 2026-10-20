import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

import { getCurrentBranch, getHeadCommit, listFilesInHeadCommit, scanCommittedTree } from "./scanner.js";

const scratch = useScratch();

/** Add a file to a repo and commit it. */
function commit(dir: string, name: string, content = "x"): void {
	writeFileSync(join(dir, name), content, "utf8");
	execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "msg"], { cwd: dir, stdio: "ignore" });
}

describe("scanCommittedTree", () => {
	it("collects extensions and known extensionless types from the committed tree", () => {
		const dir = scratch.repo({ "a.ts": "x", Dockerfile: "FROM x", "styles.CSS": "x" });

		const scan = scanCommittedTree(dir);
		expect(scan.fileTypes.has(".ts")).toBe(true);
		expect(scan.fileTypes.has(".css")).toBe(true);
		expect(scan.fileTypes.has("dockerfile")).toBe(true);
		expect(scan.fileCount).toBeGreaterThanOrEqual(3);
	});

	it("returns an empty result for a non-git directory", () => {
		const scan = scanCommittedTree(scratch.dir("opx-nogit-"));
		expect(scan.fileTypes.size).toBe(0);
		expect(scan.fileCount).toBe(0);
	});

	it("returns empty for a git repo with no commits", () => {
		expect(scanCommittedTree(scratch.repo()).fileTypes.size).toBe(0);
	});
});

describe("getCurrentBranch", () => {
	it("returns the branch name of a committed repo", () => {
		expect(getCurrentBranch(scratch.repo({ "a.ts": "x" }))).toBe("main");
	});

	it("returns HEAD for a non-git directory", () => {
		expect(getCurrentBranch(scratch.dir("opx-nogit-"))).toBe("HEAD");
	});
});

describe("listFilesInHeadCommit", () => {
	it("lists files changed in the latest commit", () => {
		const dir = scratch.repo({ "a.ts": "x" });
		commit(dir, "b.js");
		expect(listFilesInHeadCommit(dir)).toContain("b.js");
		expect(listFilesInHeadCommit(dir)).not.toContain("a.ts");
	});

	it("returns [] for a non-git directory", () => {
		expect(listFilesInHeadCommit(scratch.dir("opx-nogit-"))).toEqual([]);
	});
});

describe("getHeadCommit", () => {
	it("returns the HEAD sha after a commit", () => {
		expect(getHeadCommit(scratch.repo({ "a.ts": "x" }))).toMatch(/^[0-9a-f]{40}$/);
	});

	it("returns undefined for a non-git directory", () => {
		expect(getHeadCommit(scratch.dir("opx-nogit-"))).toBeUndefined();
	});

	it("returns undefined for a repo with no commits", () => {
		expect(getHeadCommit(scratch.repo())).toBeUndefined();
	});
});
