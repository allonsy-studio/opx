import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getCurrentBranch, getHeadCommit, listFilesInHeadCommit, scanCommittedTree } from "./scanner.js";

function gitRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-scan-"));
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["init", "-b", "main"], opts);
	execFileSync("git", ["config", "user.email", "t@t.io"], opts);
	execFileSync("git", ["config", "user.name", "t"], opts);
	return dir;
}

function commit(dir: string, name: string, content = "x"): void {
	writeFileSync(join(dir, name), content, "utf8");
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["add", "."], opts);
	execFileSync("git", ["commit", "-m", "msg"], opts);
}

describe("scanCommittedTree", () => {
	it("collects extensions and known extensionless types from the committed tree", () => {
		const dir = gitRepo();
		commit(dir, "a.ts");
		writeFileSync(join(dir, "Dockerfile"), "FROM x", "utf8");
		writeFileSync(join(dir, "styles.CSS"), "x", "utf8");
		execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "more"], { cwd: dir, stdio: "ignore" });

		const scan = scanCommittedTree(dir);
		expect(scan.fileTypes.has(".ts")).toBe(true);
		expect(scan.fileTypes.has(".css")).toBe(true);
		expect(scan.fileTypes.has("dockerfile")).toBe(true);
		expect(scan.fileCount).toBeGreaterThanOrEqual(3);
		rmSync(dir, { recursive: true });
	});

	it("returns an empty result for a non-git directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-nogit-"));
		const scan = scanCommittedTree(dir);
		expect(scan.fileTypes.size).toBe(0);
		expect(scan.fileCount).toBe(0);
		rmSync(dir, { recursive: true });
	});

	it("returns empty for a git repo with no commits", () => {
		const dir = gitRepo();
		const scan = scanCommittedTree(dir);
		expect(scan.fileTypes.size).toBe(0);
		rmSync(dir, { recursive: true });
	});
});

describe("getCurrentBranch", () => {
	it("returns the branch name of a committed repo", () => {
		const dir = gitRepo();
		commit(dir, "a.ts");
		expect(getCurrentBranch(dir)).toBe("main");
		rmSync(dir, { recursive: true });
	});

	it("returns HEAD for a non-git directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-nogit-"));
		expect(getCurrentBranch(dir)).toBe("HEAD");
		rmSync(dir, { recursive: true });
	});
});

describe("listFilesInHeadCommit", () => {
	it("lists files changed in the latest commit", () => {
		const dir = gitRepo();
		commit(dir, "a.ts");
		commit(dir, "b.js");
		expect(listFilesInHeadCommit(dir)).toContain("b.js");
		rmSync(dir, { recursive: true });
	});

	it("returns [] for a non-git directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-nogit-"));
		expect(listFilesInHeadCommit(dir)).toEqual([]);
		rmSync(dir, { recursive: true });
	});
});

describe("getHeadCommit", () => {
	it("returns the HEAD sha after a commit", () => {
		const dir = gitRepo();
		commit(dir, "a.ts");
		expect(getHeadCommit(dir)).toMatch(/^[0-9a-f]{40}$/);
		rmSync(dir, { recursive: true });
	});

	it("returns undefined for a non-git directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-nogit-"));
		expect(getHeadCommit(dir)).toBeUndefined();
		rmSync(dir, { recursive: true });
	});
});
