import { jest } from "@jest/globals";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runToggleCommand } from "./toggle-command.js";

const noConcerns = async (): Promise<undefined> => undefined;

describe("runToggleCommand", () => {
	const dirs: string[] = [];
	let log: ReturnType<typeof jest.spyOn>;
	let error: ReturnType<typeof jest.spyOn>;

	const project = (config?: unknown, pkg: unknown = { name: "p" }): string => {
		const dir = mkdtempSync(join(tmpdir(), "opx-toggle-"));
		dirs.push(dir);
		writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
		if (config) {
			mkdirSync(join(dir, ".opx"), { recursive: true });
			writeFileSync(join(dir, ".opx", "config.json"), JSON.stringify(config));
		}
		return dir;
	};
	const configOf = (dir: string) => JSON.parse(readFileSync(join(dir, ".opx", "config.json"), "utf8"));
	const said = (spy: ReturnType<typeof jest.spyOn>): string => spy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		error = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		jest.restoreAllMocks();
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("enables a plugin, creating the config if there isn't one", async () => {
		const dir = project();
		expect(await runToggleCommand(dir, "js", true)).toBe(0);
		expect(configOf(dir).lint).toEqual({ js: true });
		expect(said(log)).toContain('enabled "js" in lint');
	});

	it("prints the lines the project's eslint.config.js lacks after enabling", async () => {
		const dir = project({ version: 1, lint: { js: "./eslint.config.js" } });
		writeFileSync(join(dir, "eslint.config.js"), 'import js from "@allons-y/opx-lint-js/eslint.config.js";\nexport default [...js];\n');
		await runToggleCommand(dir, "ts", true);
		expect(configOf(dir).lint.ts).toBe("./eslint.config.js");
		expect(said(log)).toContain('import ts from "@allons-y/opx-lint-ts/eslint.config.js";');
	});

	it("asks for a lint-js upgrade when lint-ts joins a 0.x lint-js", async () => {
		const dir = project({ version: 1, lint: { js: true } }, { name: "p", devDependencies: { "@allons-y/opx-lint-js": "^0.1.0-beta.0" } });
		await runToggleCommand(dir, "ts", true);
		expect(said(log)).toContain("linted twice");
		expect(said(log)).toContain("@allons-y/opx-lint-js@^1.0.0-beta.1");
	});

	it("gives the same advice when enabling by package id", async () => {
		const dir = project({ version: 1, lint: { js: true } }, { name: "p", devDependencies: { "@allons-y/opx-lint-js": "^0.1.0-beta.0" } });
		await runToggleCommand(dir, "@allons-y/opx-lint-ts", true);
		expect(configOf(dir).lint.ts).toBe(true);
		expect(said(log)).toContain("linted twice");
	});

	it("gives no follow-up advice when nothing applies", async () => {
		const dir = project({ version: 1, lint: { js: true } }, { name: "p", devDependencies: { "@allons-y/opx-lint-js": "^1.0.0-beta.3" } });
		await runToggleCommand(dir, "ts", true);
		expect(log).toHaveBeenCalledTimes(1);
		await runToggleCommand(dir, "ts", true);
		expect(said(log)).not.toContain("linted twice");
	});

	it("writes a third-party plugin to the tasks its loaded detectors declare", async () => {
		const dir = project(undefined, { devDependencies: { "opx-plugin-foo": "1" } });
		const concernsOf = jest.fn(async () => ["build" as const]);
		expect(await runToggleCommand(dir, "foo", true, undefined, concernsOf)).toBe(0);
		expect(concernsOf).toHaveBeenCalledWith("opx-plugin-foo", dir, expect.anything());
		expect(configOf(dir).build).toEqual({ "opx-plugin-foo": true });
		expect(configOf(dir).lint ?? {}).toEqual({});
	});

	it("fails without writing when a third-party plugin can't be loaded and no --task is given", async () => {
		const dir = project();
		expect(await runToggleCommand(dir, "@acme/opx-plugin-x", true, undefined, noConcerns)).toBe(1);
		expect(said(error)).toContain("--task");
		expect(existsSync(join(dir, ".opx", "config.json"))).toBe(false);
	});

	it("uses --task for a third-party plugin without loading it", async () => {
		const dir = project();
		const concernsOf = jest.fn(async () => ["build" as const]);
		expect(await runToggleCommand(dir, "@acme/opx-plugin-x", true, ["lint"], concernsOf)).toBe(0);
		expect(configOf(dir).lint).toEqual({ "@acme/opx-plugin-x": true });
		expect(concernsOf).not.toHaveBeenCalled();
	});

	it("never loads a first-party plugin to enable it", async () => {
		const dir = project();
		const concernsOf = jest.fn(noConcerns);
		expect(await runToggleCommand(dir, "@allons-y/opx-lint-ts", true, undefined, concernsOf)).toBe(0);
		expect(concernsOf).not.toHaveBeenCalled();
		expect(configOf(dir).lint).toEqual({ ts: true });
	});

	describe("errors", () => {
		it("rejects an unknown plugin with exit code 1 and writes nothing", async () => {
			const dir = project();
			expect(await runToggleCommand(dir, "css", true)).toBe(1);
			expect(said(error)).toContain("unknown plugin");
			expect(existsSync(join(dir, ".opx", "config.json"))).toBe(false);
		});
	});

	describe("no-ops", () => {
		it("reports an already-enabled plugin without rewriting the config", async () => {
			const dir = project({ version: 1, lint: { js: true } });
			const path = join(dir, ".opx", "config.json");
			writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
			const marker = readFileSync(path, "utf8");
			expect(await runToggleCommand(dir, "js", true)).toBe(0);
			expect(said(log)).toContain("already enabled");
			expect(readFileSync(path, "utf8")).toBe(marker);
		});

		it("does not create a config when disabling something that isn't enabled", async () => {
			const dir = project();
			expect(await runToggleCommand(dir, "js", false)).toBe(0);
			expect(said(log)).toContain("already disabled");
			expect(existsSync(join(dir, ".opx", "config.json"))).toBe(false);
		});
	});

	it("fails loudly on a corrupt config instead of overwriting it", async () => {
		const dir = project();
		mkdirSync(join(dir, ".opx"), { recursive: true });
		writeFileSync(join(dir, ".opx", "config.json"), "{oops");
		await expect(runToggleCommand(dir, "js", true)).rejects.toThrow();
		expect(readFileSync(join(dir, ".opx", "config.json"), "utf8")).toBe("{oops");
	});
});

describe("readConcerns", () => {
	it("returns undefined for a plugin that can't be loaded", async () => {
		const { readConcerns } = await import("./toggle-command.js");
		expect(await readConcerns("opx-plugin-missing-xyz", process.cwd(), {})).toBeUndefined();
	});
});
