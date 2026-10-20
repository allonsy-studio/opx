import { execFileSync } from "node:child_process";
import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { CleanupSuggestion, Detector, DetectorContext, PackageJson } from "@allons-y/opx";
import { useScratch } from "shared/testing.js";

import { applyCleanup, describePlan, planCleanup } from "./cleanup.js";

const git = (dir: string, ...args: string[]): void => void execFileSync("git", args, { cwd: dir, stdio: "ignore" });

const file = (target: string, hint?: string): CleanupSuggestion => ({ kind: "file", target, reason: "not applied", hint });
const pkg = (target: string): CleanupSuggestion => ({ kind: "dependency", target, reason: "bundled by @acme/opx-x" });
const setting = (target: string): CleanupSuggestion => ({ kind: "setting", target, reason: "not applied", hint: "move it" });
const plugin = (...suggestions: CleanupSuggestion[]): Detector => ({ cleanup: () => suggestions }) as unknown as Detector;
const scratch = useScratch();
const targets = (list: Array<{ target: string }>): string[] => list.map((i) => i.target).sort();

describe("cleanup", () => {
	/** A repo whose first commit holds the files; empty when none are given. */
	const make = (files: Record<string, string> = {}): string => scratch.repo(files);
	const ctx = (cwd: string, hostPkg: PackageJson = {}): DetectorContext => ({ cwd, hostPkg, pkgManager: "yarn" }) as unknown as DetectorContext;

	describe("files", () => {
		it("deletes only a file that is empty and unchanged in git", () => {
			const dir = make({ ".eslintrc.json": "{}\n", ".eslintignore": "# nothing yet\n\n", ".eslintrc.yml": "/* x */\n" });
			const plan = planCleanup(ctx(dir), [plugin(file(".eslintrc.json"), file(".eslintignore"), file(".eslintrc.yml"))]);
			expect(plan.delete.sort()).toEqual([".eslintignore", ".eslintrc.json", ".eslintrc.yml"]);
			expect(plan.advice).toEqual([]);
		});

		it("keeps a file with content, and passes the plugin's hint on", () => {
			const dir = make({ ".eslintrc.json": JSON.stringify({ root: true }), ".eslintignore": "node_modules\n", ".eslintrc.js": "module.exports = {};\n" });
			const plan = planCleanup(ctx(dir), [plugin(file(".eslintrc.json", "migrate it"), file(".eslintignore"), file(".eslintrc.js"))]);
			expect(plan.delete).toEqual([]);
			expect(targets(plan.advice)).toEqual([".eslintignore", ".eslintrc.js", ".eslintrc.json"]);
			expect(plan.advice.find((a) => a.target === ".eslintrc.json")?.hint).toBe("migrate it");
		});

		it("does not delete an empty file git cannot restore, and says why", () => {
			const dir = make({ ".eslintrc.json": "{}" });
			writeFileSync(join(dir, ".eslintrc.json"), "{ }\n// edited\n");
			writeFileSync(join(dir, ".eslintrc.yml"), "# new\n");
			const plan = planCleanup(ctx(dir), [plugin(file(".eslintrc.json"), file(".eslintrc.yml"))]);
			expect(plan.delete).toEqual([]);
			expect(plan.advice.find((a) => a.target === ".eslintrc.yml")?.reason).toContain("commit or stash");
			expect(plan.advice.find((a) => a.target === ".eslintrc.json")?.reason).toContain("commit or stash");
		});

		it("says nothing about a suggested file the project does not have", () => {
			expect(planCleanup(ctx(make()), [plugin(file(".eslintrc"))])).toEqual({ delete: [], advice: [], kept: [], command: "" });
		});

		it("ignores paths outside the repository", () => {
			const dir = make();
			const outside = scratch.dir("opx-outside-");
			writeFileSync(join(outside, "empty"), "");
			const relative = join("..", basename(outside), "empty");
			const plan = planCleanup(ctx(dir), [plugin(file(join(outside, "empty")), file(relative))]);
			expect(plan).toEqual({ delete: [], advice: [], kept: [], command: "" });
			expect(applyCleanup(dir, [join(outside, "empty"), relative])).toEqual([]);
			expect(existsSync(join(outside, "empty"))).toBe(true);
		});

		it("never deletes a symlink or a directory", () => {
			const dir = make({ "real.txt": "", "dir/keep": "x" });
			symlinkSync(join(dir, "real.txt"), join(dir, ".eslintrc"));
			git(dir, "add", ".");
			git(dir, "commit", "-m", "link");
			const plan = planCleanup(ctx(dir), [plugin(file(".eslintrc"), file("dir"))]);
			expect(plan.delete).toEqual([]);
			expect(applyCleanup(dir, [".eslintrc", "dir"])).toEqual([]);
			expect(existsSync(join(dir, "real.txt"))).toBe(true);
		});
	});

	describe("settings", () => {
		it("advises on a package.json key only when it is there", () => {
			const plan = planCleanup(ctx(make(), { eslintConfig: {}, name: "h" }), [plugin(setting("eslintConfig"), setting("eslintIgnore"))]);
			expect(plan.advice).toEqual([{ target: "package.json › eslintConfig", reason: "not applied", hint: "move it" }]);
			expect(plan.delete).toEqual([]);
		});
	});

	describe("packages", () => {
		const dev = (...names: string[]): PackageJson => ({ devDependencies: Object.fromEntries(names.map((n) => [n, "^1.0.0"])) });

		it("advises on unused dev dependencies with one command, and never runs it", () => {
			const dir = make();
			const plan = planCleanup(ctx(dir, dev("eslint", "globals", "jest")), [plugin(pkg("eslint"), pkg("globals"), pkg("@eslint/js"))]);
			expect(targets(plan.advice)).toEqual(["eslint", "globals"]);
			expect(plan.command).toBe("yarn remove eslint globals");
			expect(plan.advice[0]?.reason).toContain("bundled by @acme/opx-x");
		});

		it("builds the command for the project's package manager", () => {
			const plan = planCleanup({ ...ctx(make(), dev("eslint")), pkgManager: "pnpm" } as DetectorContext, [plugin(pkg("eslint"))]);
			expect(plan.command).toBe("pnpm remove eslint");
		});

		it("keeps a package the project imports, requires, references in config, or runs", () => {
			const dir = make({
				"eslint.config.js": 'import js from "@eslint/js";\nimport { defineConfig } from "eslint/config";\n',
				"src/env.cjs": 'const globals = require("globals");\n',
				".husky/pre-commit": "npx prettier --check .\n",
				"tsconfig.json": '{ "extends": "@acme/base" }\n',
			});
			const names = ["@eslint/js", "globals", "eslint", "prettier", "@acme/base"];
			const plan = planCleanup(ctx(dir, dev(...names)), [plugin(...names.map(pkg))]);
			expect(plan.advice).toEqual([]);
			expect(plan.command).toBe("");
			expect(targets(plan.kept)).toEqual([...names].sort());
			expect(plan.kept.find((k) => k.target === "globals")?.reason).toBe("used by src/env.cjs");
		});

		it("does not count a lockfile as use, since it names every installed package", () => {
			const dir = make({
				"package-lock.json": '{ "packages": { "node_modules/eslint": { "version": "9.0.0" } } }\n',
				"pnpm-lock.yaml": "packages:\n  'eslint':\n    resolution: {}\n",
			});
			const plan = planCleanup(ctx(dir, dev("eslint")), [plugin(pkg("eslint"))]);
			expect(plan.kept).toEqual([]);
			expect(targets(plan.advice)).toEqual(["eslint"]);
		});

		it("treats a script, hook, or workflow that runs the tool as use, but not an eslint-disable comment", () => {
			const script = make({ "package.json": JSON.stringify({ scripts: { lint: "eslint ." } }) });
			expect(targets(planCleanup(ctx(script, dev("eslint")), [plugin(pkg("eslint"))]).kept)).toEqual(["eslint"]);

			const hook = make({ ".husky/pre-commit": "npx eslint --fix\n" });
			expect(targets(planCleanup(ctx(hook, dev("eslint")), [plugin(pkg("eslint"))]).kept)).toEqual(["eslint"]);

			const workflow = make({ ".github/workflows/ci.yml": "steps:\n  - run: yarn eslint src\n" });
			expect(targets(planCleanup(ctx(workflow, dev("eslint")), [plugin(pkg("eslint"))]).kept)).toEqual(["eslint"]);

			const comment = make({ "src/a.js": "// eslint-disable-next-line no-console\nconsole.log(1);\n" });
			expect(targets(planCleanup(ctx(comment, dev("eslint")), [plugin(pkg("eslint"))]).advice)).toEqual(["eslint"]);
		});

		it("does not count the dependency declaration itself as use", () => {
			const dir = make({ "package.json": JSON.stringify({ devDependencies: { eslint: "^9" }, peerDependencies: {} }) });
			expect(targets(planCleanup(ctx(dir, dev("eslint")), [plugin(pkg("eslint"))]).advice)).toEqual(["eslint"]);
		});

		it("leaves a package alone if removing it would change another field", () => {
			const hostPkg: PackageJson = { devDependencies: { eslint: "^9" }, peerDependencies: { eslint: ">=9" } };
			const plan = planCleanup(ctx(make(), hostPkg), [plugin(pkg("eslint"))]);
			expect(plan.advice).toEqual([]);
			expect(plan.command).toBe("");
			expect(plan.kept).toEqual([{ target: "eslint", reason: "also listed under peerDependencies, which removing it would change" }]);

			const prod = planCleanup(ctx(make(), { devDependencies: { globals: "1" }, dependencies: { globals: "1" } }), [plugin(pkg("globals"))]);
			expect(prod.kept[0]?.reason).toContain("dependencies");
		});

		it("says nothing about a package the project does not list as a dev dependency", () => {
			const plan = planCleanup(ctx(make(), { dependencies: { eslint: "^9" } }), [plugin(pkg("eslint"), pkg("globals"))]);
			expect(plan).toEqual({ delete: [], advice: [], kept: [], command: "" });
		});

		it("keeps everything when the project's files cannot be listed", () => {
			const dir = scratch.dir("opx-clean-nogit-");
			const plan = planCleanup(ctx(dir, dev("eslint")), [plugin(pkg("eslint"))]);
			expect(plan.advice).toEqual([]);
			expect(plan.kept[0]?.reason).toContain("could not list");
		});
	});

	describe("plugins", () => {
		it("merges the same suggestion from several plugins", () => {
			const dir = make({ ".eslintrc": "" });
			const plan = planCleanup(ctx(dir, { devDependencies: { eslint: "1" } }), [plugin(file(".eslintrc"), pkg("eslint")), plugin(file(".eslintrc"), pkg("eslint"))]);
			expect(plan.delete).toEqual([".eslintrc"]);
			expect(plan.advice).toHaveLength(1);
		});

		it("skips a plugin with no suggestions or one that throws", () => {
			const broken = { cleanup: () => { throw new Error("boom"); } } as unknown as Detector;
			const silent = {} as Detector;
			expect(planCleanup(ctx(make()), [broken, silent])).toEqual({ delete: [], advice: [], kept: [], command: "" });
		});
	});

	describe("commands", () => {
		const migrate = { run: ["npx", "@eslint/migrate-config", ".eslintrc.json"], description: "Convert it" };
		const withCommand = (target: string, command: CleanupSuggestion["command"]): CleanupSuggestion => ({ ...file(target), command });

		it("passes a plugin's command along on a file that stays", () => {
			const dir = make({ ".eslintrc.json": '{ "rules": {} }' });
			const plan = planCleanup(ctx(dir), [plugin(withCommand(".eslintrc.json", migrate))]);
			expect(plan.advice).toEqual([expect.objectContaining({ target: ".eslintrc.json", command: migrate })]);
		});

		it("passes it along on a package.json key", () => {
			const dir = make();
			const plan = planCleanup(ctx(dir, { eslintConfig: {} }), [plugin({ ...setting("eslintConfig"), command: migrate })]);
			expect(plan.advice[0]?.command).toEqual(migrate);
		});

		it("drops a command that is not a list of non-empty strings", () => {
			const dir = make({ ".eslintrc.json": '{ "rules": {} }' });
			for (const bad of [{ run: [] }, { run: ["npx", ""] }, { run: "npx foo" }, { run: [1] }, {}]) {
				const plan = planCleanup(ctx(dir), [plugin(withCommand(".eslintrc.json", bad as never))]);
				expect(plan.advice[0]?.command).toBeUndefined();
			}
		});

		it("never runs it", () => {
			const dir = make({ ".eslintrc.json": '{ "rules": {} }' });
			planCleanup(ctx(dir), [plugin(withCommand(".eslintrc.json", { run: ["touch", "ran.txt"] }))]);
			expect(existsSync(join(dir, "ran.txt"))).toBe(false);
		});
	});

	describe("applyCleanup", () => {
		it("deletes the planned files", () => {
			const dir = make({ ".eslintrc.json": "{}" });
			const { delete: paths } = planCleanup(ctx(dir), [plugin(file(".eslintrc.json"))]);
			expect(applyCleanup(dir, paths)).toEqual([".eslintrc.json"]);
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(false);
		});

		it("re-checks each file, so a file that gained content since planning stays", () => {
			const dir = make({ ".eslintrc.json": "{}" });
			const { delete: paths } = planCleanup(ctx(dir), [plugin(file(".eslintrc.json"))]);
			writeFileSync(join(dir, ".eslintrc.json"), '{ "rules": {} }');
			expect(applyCleanup(dir, paths)).toEqual([]);
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
		});

		it("refuses any other file it is handed", () => {
			const dir = make({ "src/app.js": "export {};\n", "empty.txt": "" });
			writeFileSync(join(dir, "empty.txt"), "");
			expect(applyCleanup(dir, ["src/app.js", "missing", "package.json"])).toEqual([]);
			expect(existsSync(join(dir, "src/app.js"))).toBe(true);
		});
	});

	describe("describePlan", () => {
		it("lists empty files, advice with hints, the command, and what is kept", () => {
			const lines = describePlan({
				delete: [".eslintrc"],
				advice: [{ target: "eslint", reason: "bundled" }, { target: ".eslintrc.json", reason: "not applied", hint: "migrate it" }],
				kept: [{ target: "globals", reason: "used by a.js" }],
				command: "yarn remove eslint",
			});
			expect(lines).toEqual([
				"Empty files that git can restore:",
				"  - .eslintrc",
				"Suggested by your plugins (for you to do):",
				"  - eslint: bundled",
				"  - .eslintrc.json: not applied",
				"      migrate it",
				"Drop the unused packages with: yarn remove eslint",
				"Keeping:",
				"  - globals: used by a.js",
			]);
		});

		it("prints a plugin's command, quoted so it can be pasted", () => {
			const lines = describePlan({
				delete: [],
				advice: [
					{ target: ".eslintrc.json", reason: "r", command: { run: ["npx", "@eslint/migrate-config", ".eslintrc.json"], description: "Convert it" } },
					{ target: "my file", reason: "r", command: { run: ["npx", "tool", "my file", "it's"] } },
				],
				kept: [],
				command: "",
			});
			expect(lines).toContain("      Run: npx @eslint/migrate-config .eslintrc.json (Convert it)");
			expect(lines).toContain("      Run: npx tool 'my file' 'it'\\''s'");
		});

		it("is empty for an empty plan", () => {
			expect(describePlan({ delete: [], advice: [], kept: [], command: "" })).toEqual([]);
		});
	});
});
