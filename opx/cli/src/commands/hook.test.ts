import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runPostCommit } from "./hook.js";

const TODAY = "2026-06-15";

/** A git repo with one initial commit, ready for the test to commit more files. */
function repo(): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-hook-"));
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["init", "-b", "main"], opts);
	execFileSync("git", ["config", "user.email", "t@t.io"], opts);
	execFileSync("git", ["config", "user.name", "t"], opts);
	commit(dir, { "README.txt": "x" });
	return dir;
}

function commit(dir: string, files: Record<string, string>): void {
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf8");
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["add", "."], opts);
	execFileSync("git", ["commit", "-m", "msg"], opts);
}

function writeConfig(dir: string, config: unknown): void {
	mkdirSync(join(dir, ".opx"), { recursive: true });
	writeFileSync(join(dir, ".opx", "config.json"), JSON.stringify(config));
}

function writeState(dir: string, state: unknown): void {
	mkdirSync(join(dir, ".opx"), { recursive: true });
	writeFileSync(join(dir, ".opx", "state.json"), JSON.stringify(state));
}

describe("runPostCommit", () => {
	const dirs: string[] = [];
	let log: ReturnType<typeof jest.spyOn>;

	const make = (): string => {
		const dir = repo();
		dirs.push(dir);
		return dir;
	};
	const output = (): string => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => {
		jest.restoreAllMocks();
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("nudges about a plugin for a new file type", () => {
		const dir = make();
		commit(dir, { "notes.md": "# hi" });
		runPostCommit(dir, TODAY);
		expect(output()).toContain("new md files detected");
		expect(output()).toContain("`opx enable md`");
		expect(output()).toContain("@allons-y/opx-lint-md");
	});

	it("nudges once per detected type", () => {
		const dir = make();
		commit(dir, { "a.js": "x", "b.md": "x" });
		runPostCommit(dir, TODAY);
		expect(output()).toContain("new js files");
		expect(output()).toContain("new md files");
	});

	it("stays quiet for file types no plugin handles", () => {
		const dir = make();
		commit(dir, { "data.xyz": "x" });
		runPostCommit(dir, TODAY);
		expect(log).not.toHaveBeenCalled();
	});

	it("does not nudge for a plugin that is already enabled", () => {
		const dir = make();
		commit(dir, { "notes.md": "x" });
		writeConfig(dir, { version: 1, lint: { md: true } });
		runPostCommit(dir, TODAY);
		expect(log).not.toHaveBeenCalled();
	});

	it("still nudges for a plugin set to false", () => {
		const dir = make();
		commit(dir, { "notes.md": "x" });
		writeConfig(dir, { version: 1, lint: { md: false } });
		runPostCommit(dir, TODAY);
		expect(output()).toContain("new md files detected");
	});

	describe("deferrals", () => {
		const deferral = (over: Record<string, string> = {}) => ({
			version: 1,
			deferrals: { md: { branch: "main", skipUntilDate: TODAY, reason: "later", ...over } },
		});

		it("is silent while a deferral for this branch is active, including its last day", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			writeState(dir, deferral());
			runPostCommit(dir, TODAY);
			expect(log).not.toHaveBeenCalled();
		});

		it("nudges again once the deferral has expired", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			writeState(dir, deferral({ skipUntilDate: "2026-06-14" }));
			runPostCommit(dir, TODAY);
			expect(output()).toContain("new md files detected");
		});

		it("ignores a deferral recorded on another branch", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			writeState(dir, deferral({ branch: "feature" }));
			runPostCommit(dir, TODAY);
			expect(output()).toContain("new md files detected");
		});
	});

	describe("state", () => {
		it("records the commit it scanned", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			runPostCommit(dir, TODAY);
			const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
			expect(JSON.parse(readFileSync(join(dir, ".opx", "state.json"), "utf8")).lastScanCommit).toBe(head);
		});

		it("keeps existing deferrals when it records the commit", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			writeState(dir, { version: 1, deferrals: { js: { branch: "main", skipUntilDate: TODAY, reason: "later" } } });
			runPostCommit(dir, TODAY);
			expect(JSON.parse(readFileSync(join(dir, ".opx", "state.json"), "utf8")).deferrals.js).toBeDefined();
		});

		it("does not rewrite state for a commit it already scanned", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			runPostCommit(dir, TODAY);
			const path = join(dir, ".opx", "state.json");
			const marker = `${readFileSync(path, "utf8")}\n`;
			writeFileSync(path, marker);
			runPostCommit(dir, TODAY);
			expect(readFileSync(path, "utf8")).toBe(marker);
		});
	});

	describe("never fails the commit", () => {
		it("is silent when the config is unreadable", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			mkdirSync(join(dir, ".opx"), { recursive: true });
			writeFileSync(join(dir, ".opx", "config.json"), "{oops");
			expect(() => runPostCommit(dir, TODAY)).not.toThrow();
			expect(log).not.toHaveBeenCalled();
		});

		it("does nothing outside a git repository", () => {
			const dir = mkdtempSync(join(tmpdir(), "opx-nogit-"));
			dirs.push(dir);
			expect(() => runPostCommit(dir, TODAY)).not.toThrow();
			expect(log).not.toHaveBeenCalled();
			expect(existsSync(join(dir, ".opx", "state.json"))).toBe(false);
		});
	});
});
