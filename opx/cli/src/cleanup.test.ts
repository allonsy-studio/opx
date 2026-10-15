import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { OpxConfig, PackageJson } from "@allons-y/opx";

import { applyCleanup, planCleanup } from "./cleanup.js";
import { PLUGIN_CATALOG } from "./plugin-catalog.js";

const JS: OpxConfig = { version: 1, lint: { js: true } };
const PLUGIN_DEPS = { "@allons-y/opx-lint-js": "^1.0.0" };

/** A git repo whose first commit holds the given files; `package.json` is built from `pkg`. */
function repo(pkg: PackageJson, files: Record<string, string> = {}, indent: string | number = 2): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-clean-"));
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["init", "-b", "main"], opts);
	execFileSync("git", ["config", "user.email", "t@t.io"], opts);
	execFileSync("git", ["config", "user.name", "t"], opts);
	writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, indent)}\n`);
	for (const [name, content] of Object.entries(files)) {
		mkdirSync(join(dir, name, ".."), { recursive: true });
		writeFileSync(join(dir, name), content);
	}
	execFileSync("git", ["add", "."], opts);
	execFileSync("git", ["commit", "-m", "init"], opts);
	return dir;
}

/** Make `name` look installed, declaring the given peer dependencies. */
function install(dir: string, name: string, peerDependencies: Record<string, string>): void {
	const folder = join(dir, "node_modules", ...name.split("/"));
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "package.json"), JSON.stringify({ name, peerDependencies }));
}

const targets = (list: Array<{ target: string }>): string[] => list.map((i) => i.target).sort();

describe("planCleanup", () => {
	const dirs: string[] = [];
	const make = (pkg: PackageJson, files?: Record<string, string>, indent?: string | number): string => {
		const dir = repo(pkg, files, indent);
		dirs.push(dir);
		return dir;
	};
	const pkgOf = (devDependencies: Record<string, string>, extra: PackageJson = {}): PackageJson => ({ name: "host", devDependencies: { ...PLUGIN_DEPS, ...devDependencies }, ...extra });
	const plan = (dir: string, config: OpxConfig = JS) => planCleanup(dir, config, JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson);

	afterEach(() => {
		for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
	});

	describe("dependencies", () => {
		it("offers the packages an installed, enabled plugin bundles", () => {
			const dir = make(pkgOf({ eslint: "^9.0.0", "@eslint/js": "^9.0.0", globals: "^15.0.0", jest: "^30.0.0" }));
			expect(targets(plan(dir).removals)).toEqual(["@eslint/js", "eslint", "globals"]);
		});

		it("offers nothing until the plugin is installed and enabled", () => {
			const declared = { eslint: "^9.0.0" };
			expect(plan(make({ name: "h", devDependencies: declared })).removals).toEqual([]);
			expect(plan(make(pkgOf(declared)), { version: 1 }).removals).toEqual([]);
			expect(plan(make(pkgOf(declared)), { version: 1, lint: { js: false } }).removals).toEqual([]);
		});

		it("never offers packages the plugin does not bundle", () => {
			const dir = make(pkgOf({ "eslint-plugin-react": "^7.0.0", prettier: "^3.0.0", typescript: "^5.0.0" }));
			expect(plan(dir).removals).toEqual([]);
		});

		it("keeps a package the project's own files import or reference", () => {
			const dir = make(pkgOf({ eslint: "^9.0.0", "@eslint/js": "^9.0.0", globals: "^15.0.0", "@stylistic/eslint-plugin": "^5.0.0" }), {
				"eslint.config.js": 'import js from "@eslint/js";\nimport { defineConfig } from "eslint/config";\nexport default defineConfig([js.configs.recommended]);\n',
				"src/env.cjs": 'const globals = require("globals");\n',
				"lib/styles.mjs": 'const s = await import("@stylistic/eslint-plugin");\n',
			});
			const result = plan(dir);
			expect(result.removals).toEqual([]);
			expect(result.kept.map((k) => k.reason)).toEqual(expect.arrayContaining([expect.stringContaining("eslint.config.js"), expect.stringContaining("src/env.cjs")]));
		});

		it("keeps eslint when a script, hook, or workflow runs it, but not for an eslint-disable comment", () => {
			const base = { "@eslint/js": "^9.0.0" };
			const script = make(pkgOf({ eslint: "^9.0.0", ...base }, { scripts: { lint: "eslint ." } }));
			expect(targets(plan(script).removals)).toEqual(["@eslint/js"]);

			const hook = make(pkgOf({ eslint: "^9.0.0" }), { ".husky/pre-commit": "npx eslint --fix\n" });
			expect(plan(hook).removals).toEqual([]);

			const workflow = make(pkgOf({ eslint: "^9.0.0" }), { ".github/workflows/ci.yml": "steps:\n  - run: yarn eslint src\n" });
			expect(plan(workflow).removals).toEqual([]);

			const comment = make(pkgOf({ eslint: "^9.0.0" }), { "src/a.js": "// eslint-disable-next-line no-console\nconsole.log(1);\n" });
			expect(targets(plan(comment).removals)).toEqual(["eslint"]);
		});

		it("does not count the dependency declaration itself as use", () => {
			const dir = make(pkgOf({ eslint: "^9.0.0" }, { dependencies: { globals: "^15.0.0" } }));
			expect(targets(plan(dir).removals)).toEqual(["eslint", "globals"]);
		});

		it("keeps a package another dependency needs as a peer, including through a kept chain", () => {
			const dir = make(pkgOf({ eslint: "^9.0.0", "@eslint/js": "^9.0.0", "eslint-plugin-react": "^7.0.0" }));
			install(dir, "eslint-plugin-react", { eslint: ">=8" });
			const result = plan(dir);
			expect(targets(result.removals)).toEqual(["@eslint/js"]);
			expect(result.kept).toEqual([{ target: "eslint", reason: "required as a peer by eslint-plugin-react" }]);

			const chain = make(pkgOf({ eslint: "^9.0.0", "@stylistic/eslint-plugin": "^5.0.0" }), { "eslint.config.js": 'import s from "@stylistic/eslint-plugin";\n' });
			install(chain, "@stylistic/eslint-plugin", { eslint: ">=9" });
			expect(plan(chain).removals).toEqual([]);
		});

		it("ignores an optional peer", () => {
			const dir = make(pkgOf({ eslint: "^9.0.0", "eslint-plugin-x": "^1.0.0" }));
			const folder = join(dir, "node_modules", "eslint-plugin-x");
			mkdirSync(folder, { recursive: true });
			writeFileSync(join(folder, "package.json"), JSON.stringify({ peerDependencies: { eslint: "*" }, peerDependenciesMeta: { eslint: { optional: true } } }));
			expect(targets(plan(dir).removals)).toEqual(["eslint"]);
		});

		it("keeps eslint where the bundled copy is out of reach of the project", () => {
			const pnpm = make(pkgOf({ eslint: "^9.0.0", globals: "^15.0.0" }, { packageManager: "pnpm@9.0.0" }));
			const result = plan(pnpm);
			expect(targets(result.removals)).toEqual(["globals"]);
			expect(result.kept.some((k) => k.target === "eslint")).toBe(true);

			const pnp = make(pkgOf({ eslint: "^9.0.0" }), { ".pnp.cjs": "" });
			expect(plan(pnp).removals).toEqual([]);
		});

		it("removes nothing when the project's files cannot be listed", () => {
			const dir = mkdtempSync(join(tmpdir(), "opx-clean-nogit-"));
			dirs.push(dir);
			writeFileSync(join(dir, "package.json"), "{}");
			const result = planCleanup(dir, JS, pkgOf({ eslint: "^9.0.0" }));
			expect(result.removals).toEqual([]);
			expect(result.kept[0]?.reason).toContain("could not list");
		});
	});

	describe("legacy ESLint config", () => {
		const modern = pkgOf({ eslint: "^9.0.0" });

		it("removes legacy config that says nothing the bundled config does not", () => {
			const dir = make(modern, {
				".eslintrc.json": JSON.stringify({ root: true, extends: "eslint:recommended", env: { node: true, es2022: true }, parserOptions: { ecmaVersion: 2022, sourceType: "module" } }),
				".eslintrc.yml": "# nothing here\n",
				".eslintignore": "node_modules\n/dist/\n# build output\nbin/**\n",
			});
			expect(targets(plan(dir).removals)).toEqual([".eslintignore", ".eslintrc.json", ".eslintrc.yml", "eslint"]);
		});

		it("keeps legacy config with rules, plugins, other globals, or a non-module source type", () => {
			const files: Record<string, string> = {
				".eslintrc": JSON.stringify({ rules: { "no-console": "error" } }),
				".eslintrc.json": JSON.stringify({ env: { browser: true } }),
				".eslintrc.cjs": "module.exports = { plugins: ['react'] };\n",
				".eslintrc.yaml": "extends:\n  - airbnb\n",
				".eslintignore": "node_modules\ncoverage/\nfixtures/**\n",
			};
			const result = plan(make(modern, files));
			expect(targets(result.removals)).toEqual(["eslint"]);
			expect(targets(result.kept)).toEqual([".eslintignore", ".eslintrc", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml"]);
			expect(result.kept.find((k) => k.target === ".eslintignore")?.reason).toContain("coverage/");

			const script = make(modern, { ".eslintrc.json": JSON.stringify({ parserOptions: { sourceType: "script" } }) });
			expect(targets(plan(script).kept)).toEqual([".eslintrc.json"]);
		});

		it("keeps unparseable JSON rather than guessing", () => {
			const dir = make(modern, { ".eslintrc.json": '{ // comment\n "rules": {} }\n' });
			expect(targets(plan(dir).kept)).toEqual([".eslintrc.json"]);
		});

		it("keeps legacy config an older eslint still reads", () => {
			const dir = make(pkgOf({ eslint: "^8.57.0" }, { scripts: { lint: "eslint ." } }), { ".eslintrc.json": "{}" });
			const result = plan(dir);
			expect(result.removals).toEqual([]);
			expect(result.kept.find((k) => k.target === ".eslintrc.json")?.reason).toContain("eslint ^8.57.0");
		});

		it("keeps a legacy file that has uncommitted changes or is untracked", () => {
			const dir = make(modern, { ".eslintrc.json": "{}" });
			writeFileSync(join(dir, ".eslintrc.json"), '{ "root": true }\n');
			writeFileSync(join(dir, ".eslintrc.yml"), "# new\n");
			const result = plan(dir);
			expect(targets(result.removals)).toEqual(["eslint"]);
			expect(targets(result.kept)).toEqual([".eslintrc.json", ".eslintrc.yml"]);
		});

		it("does not count a legacy file about to be removed as a user of a package", () => {
			const dir = make(pkgOf({ eslint: "^9.0.0", globals: "^15.0.0" }), { ".eslintrc.json": JSON.stringify({ root: true }) });
			expect(targets(plan(dir).removals)).toEqual([".eslintrc.json", "eslint", "globals"]);
		});

		it("handles the package.json settings", () => {
			const inert = make({ ...modern, eslintConfig: { extends: "eslint:recommended" }, eslintIgnore: ["dist", "node_modules/"] });
			expect(targets(plan(inert).removals)).toEqual(["eslint", "package.json › eslintConfig", "package.json › eslintIgnore"]);

			const custom = make({ ...modern, eslintConfig: { rules: { semi: "error" } }, eslintIgnore: ["dist", "vendor/"] });
			const result = plan(custom);
			expect(targets(result.removals)).toEqual(["eslint"]);
			expect(targets(result.kept)).toEqual(["package.json › eslintConfig", "package.json › eslintIgnore"]);
		});

		it("leaves config alone when no ESLint-based plugin is active", () => {
			const dir = make({ name: "h", devDependencies: { "@allons-y/opx-release": "^1.0.0" } }, { ".eslintrc.json": "{}" });
			expect(plan(dir, { version: 1, release: true }).removals).toEqual([]);
		});
	});
});

describe("applyCleanup", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
	});

	it("deletes files, drops package.json keys in place, and removes dependencies with the package manager", async () => {
		const dir = repo(
			{ name: "host", scripts: { lint: "opx lint" }, eslintConfig: { root: true }, eslintIgnore: ["dist"], devDependencies: { eslint: "^9.0.0" } },
			{ ".eslintrc.json": "{}", "yarn.lock": "" },
			"\t",
		);
		dirs.push(dir);
		const run = jest.fn<(cmd: string, cwd: string) => void>();

		await applyCleanup(
			dir,
			[
				{ kind: "file", target: ".eslintrc.json", reason: "" },
				{ kind: "setting", target: "package.json › eslintConfig", reason: "" },
				{ kind: "dependency", target: "eslint", reason: "" },
			],
			run,
		);

		expect(existsSync(join(dir, ".eslintrc.json"))).toBe(false);
		const text = readFileSync(join(dir, "package.json"), "utf8");
		expect(text).toBe(`${JSON.stringify({ name: "host", scripts: { lint: "opx lint" }, eslintIgnore: ["dist"], devDependencies: { eslint: "^9.0.0" } }, null, "\t")}\n`);
		expect(run).toHaveBeenCalledWith("yarn remove eslint", dir);
	});

	it("does nothing for an empty selection", async () => {
		const dir = repo({ name: "host" });
		dirs.push(dir);
		const before = readFileSync(join(dir, "package.json"), "utf8");
		const run = jest.fn<(cmd: string, cwd: string) => void>();
		await applyCleanup(dir, [], run);
		expect(run).not.toHaveBeenCalled();
		expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
	});
});

describe("plugin catalog bundles", () => {
	const root = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

	it.each(PLUGIN_CATALOG.filter((entry) => entry.bundles.length > 0).map((entry) => [entry.shortName, entry]))("%s only lists dependencies its package really ships", (shortName, entry) => {
		const pkg = JSON.parse(readFileSync(join(root, `lint-${shortName as string}`, "package.json"), "utf8")) as PackageJson;
		for (const name of entry.bundles) expect(Object.keys(pkg.dependencies ?? {})).toContain(name);
	});
});
