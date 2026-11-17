import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

import { Command } from "commander";

import type { Detector, DetectorContext } from "@allons-y/opx";

import register, { runHook, runPostCommit } from "./hook.js";

const TODAY = "2026-06-15";

const scratch = useScratch();

/** A git repo with one initial commit, ready for the test to commit more files. */
const repo = (): string => scratch.repo({ "README.txt": "x" });

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
	let log: ReturnType<typeof jest.spyOn>;

	const make = repo;
	const output = (): string => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("nudges about a plugin for a new file type", () => {
		const dir = make();
		commit(dir, { "notes.md": "# hi" });
		runPostCommit(dir, TODAY);
		expect(output()).toContain("new md files detected");
		expect(output()).toContain("`opx enable md`");
		expect(output()).toContain("@allons-y/opx-lint-md");
	});

	it("nudges about the files in a repository's first commit", () => {
		runPostCommit(scratch.repo({ "notes.md": "# hi" }), TODAY);
		expect(output()).toContain("new md files detected");
	});

	it("nudges once per detected type", () => {
		const dir = make();
		commit(dir, { "a.js": "x", "b.md": "x" });
		runPostCommit(dir, TODAY);
		expect(output()).toContain("new js files");
		expect(output()).toContain("new md files");
	});

	it("does not nudge about ts for a new declaration file", () => {
		const dir = make();
		commit(dir, { "types.d.ts": "export {};" });
		runPostCommit(dir, TODAY);
		expect(output()).not.toContain("new ts files");
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

		it("is silent while a deferral for this branch is active", () => {
			const dir = make();
			commit(dir, { "notes.md": "x" });
			writeState(dir, deferral());
			runPostCommit(dir, TODAY);
			expect(log).not.toHaveBeenCalled();
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
			const dir = scratch.dir("opx-nogit-");
			expect(() => runPostCommit(dir, TODAY)).not.toThrow();
			expect(log).not.toHaveBeenCalled();
			expect(existsSync(join(dir, ".opx", "state.json"))).toBe(false);
		});
	});
});

describe("runHook", () => {
	const detector = (shortName: string, hook: string | undefined, run: (ctx: unknown, args: string[]) => Promise<number>): Detector =>
		({ shortName, hooks: hook ? { [hook]: { args: ["hook", hook] } } : undefined, run }) as unknown as Detector;
	const ctx = { hook: "commit-msg" } as DetectorContext;
	const loading = (...detectors: Detector[]) => async (): Promise<Detector[]> => detectors;
	let stderr: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("runs only the plugins that declared the hook, with git's arguments", async () => {
		const wanted = jest.fn<(ctx: unknown, args: string[]) => Promise<number>>(async () => 0);
		const other = jest.fn(async () => 0);
		const code = await runHook(ctx, "commit-msg", [".git/COMMIT_EDITMSG"], loading(
			detector("a", "commit-msg", wanted),
			detector("b", "pre-push", other),
			detector("c", undefined, other),
		));
		expect(code).toBe(0);
		expect(wanted).toHaveBeenCalledWith(ctx, [".git/COMMIT_EDITMSG"]);
		expect(other).not.toHaveBeenCalled();
	});

	it("passes when no plugin declared the hook", async () => {
		expect(await runHook(ctx, "pre-push", [], loading(detector("a", "commit-msg", async () => 1)))).toBe(0);
	});

	it("returns the first failing code but still runs every plugin", async () => {
		const last = jest.fn(async () => 0);
		const code = await runHook(ctx, "commit-msg", [], loading(
			detector("a", "commit-msg", async () => 0),
			detector("b", "commit-msg", async () => 3),
			detector("c", "commit-msg", async () => 5),
			detector("d", "commit-msg", last),
		));
		expect(code).toBe(3);
		expect(last).toHaveBeenCalled();
	});

	it("counts a plugin that throws as failed, naming it on stderr without a stack", async () => {
		const code = await runHook(ctx, "commit-msg", [], loading(detector("lint-git", "commit-msg", async () => { throw new Error("boom"); })));
		expect(code).toBe(1);
		expect(String(stderr.mock.calls[0]?.[0])).toBe("✖ lint-git failed boom\n");
	});

	it("passes a plugin that declared the hook but has no run", async () => {
		const bare = { shortName: "bare", hooks: { "commit-msg": { args: ["hook", "commit-msg"] } } } as unknown as Detector;
		expect(await runHook(ctx, "commit-msg", [], loading(bare))).toBe(0);
	});
});

describe("opx hook <name>", () => {	const program = (): Command => {
	const cmd = new Command().exitOverride();
	register(cmd);
	return cmd;
};
const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
	process.exitCode = undefined;
	jest.restoreAllMocks();
});

it("exits with the failing plugin's code for a hook a plugin declared", async () => {
	const dir = scratch.repo({ "package.json": JSON.stringify({ name: "host", devDependencies: { "opx-plugin-gate": "1.0.0" } }) });
	writeConfig(dir, { version: 1, lint: { "opx-plugin-gate": true } });
	const plugin = join(dir, "node_modules", "opx-plugin-gate");
	mkdirSync(plugin, { recursive: true });
	writeFileSync(join(plugin, "package.json"), JSON.stringify({ name: "opx-plugin-gate", type: "module", exports: { ".": { import: "./index.js" } } }));
	writeFileSync(join(plugin, "index.js"), "export default [{ id: \"opx-plugin-gate\", shortName: \"gate\", displayName: \"Gate\", concern: \"lint\", detect: () => true, describe: () => ({ summary: \"\", bundledDeps: [] }), hooks: { \"commit-msg\": { args: [\"hook\", \"commit-msg\"], blocking: true } }, run: async (ctx, args) => (ctx.hook === \"commit-msg\" && args[0] === \"msg.txt\" ? 7 : 0) }];\n");
	process.chdir(dir);
	await program().parseAsync(["node", "opx", "hook", "commit-msg", "msg.txt"]);
	expect(process.exitCode).toBe(7);
});

it("skips with a warning, and passes, when the config can't be read", async () => {
	const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
	const dir = scratch.repo({ "package.json": "{}" });
	mkdirSync(join(dir, ".opx"));
	writeFileSync(join(dir, ".opx", "config.json"), "{ nope");
	process.chdir(dir);
	await program().parseAsync(["node", "opx", "hook", "commit-msg"]);
	expect(String(stderr.mock.calls[0]?.[0])).toContain("▲ Skipped the commit-msg hook");
	expect(process.exitCode).toBeUndefined();
});
});
