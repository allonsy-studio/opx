import { jest } from "@jest/globals";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runToggleCommand } from "./toggle-command.js";

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

	it("enables a plugin, creating the config if there isn't one", () => {
		const dir = project();
		expect(runToggleCommand(dir, "js", true)).toBe(0);
		expect(configOf(dir).lint).toEqual({ js: true });
		expect(said(log)).toContain('enabled "js" in lint');
	});

	it("preserves other settings when enabling", () => {
		const dir = project({ version: 1, lint: { md: true }, release: true });
		runToggleCommand(dir, "js", true);
		const config = configOf(dir);
		expect(config.lint).toEqual({ md: true, js: true });
		expect(config.release).toBe(true);
	});

	it("disables a plugin", () => {
		const dir = project({ version: 1, lint: { js: true, md: true } });
		expect(runToggleCommand(dir, "js", false)).toBe(0);
		expect(configOf(dir).lint).toEqual({ md: true });
		expect(said(log)).toContain('disabled "js" in lint');
	});

	it("sets the release boolean for the release task", () => {
		const dir = project({ version: 1 });
		runToggleCommand(dir, "release", true);
		expect(configOf(dir).release).toBe(true);
		runToggleCommand(dir, "release", false);
		expect(configOf(dir).release).toBe(false);
	});

	it("honors an explicit task list", () => {
		const dir = project();
		runToggleCommand(dir, "@acme/opx-plugin-x", true, ["build"]);
		const config = configOf(dir);
		expect(config.build).toEqual({ "@acme/opx-plugin-x": true });
		expect(config.lint).toBeUndefined();
	});

	it("accepts a plugin that is installed in the host project", () => {
		const dir = project(undefined, { devDependencies: { "opx-plugin-foo": "1" } });
		expect(runToggleCommand(dir, "foo", true)).toBe(0);
		expect(configOf(dir).lint).toEqual({ foo: true });
	});

	describe("errors", () => {
		it("rejects an unknown plugin with exit code 1 and writes nothing", () => {
			const dir = project();
			expect(runToggleCommand(dir, "css", true)).toBe(1);
			expect(said(error)).toContain("unknown plugin");
			expect(existsSync(join(dir, ".opx", "config.json"))).toBe(false);
		});

		it("rejects a task the plugin doesn't provide", () => {
			const dir = project();
			expect(runToggleCommand(dir, "js", true, ["build"])).toBe(1);
			expect(said(error)).toContain("does not provide: build");
		});

		it("rejects enabling a task that isn't published", () => {
			const dir = project();
			expect(runToggleCommand(dir, "test", true)).toBe(1);
			expect(said(error)).toContain("not available yet");
		});
	});

	describe("no-ops", () => {
		it("reports an already-enabled plugin without rewriting the config", () => {
			const dir = project({ version: 1, lint: { js: true } });
			const path = join(dir, ".opx", "config.json");
			writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
			const marker = readFileSync(path, "utf8");
			expect(runToggleCommand(dir, "js", true)).toBe(0);
			expect(said(log)).toContain("already enabled");
			expect(readFileSync(path, "utf8")).toBe(marker);
		});

		it("does not create a config when disabling something that isn't enabled", () => {
			const dir = project();
			expect(runToggleCommand(dir, "js", false)).toBe(0);
			expect(said(log)).toContain("already disabled");
			expect(existsSync(join(dir, ".opx", "config.json"))).toBe(false);
		});
	});

	it("fails loudly on a corrupt config instead of overwriting it", () => {
		const dir = project();
		mkdirSync(join(dir, ".opx"), { recursive: true });
		writeFileSync(join(dir, ".opx", "config.json"), "{oops");
		expect(() => runToggleCommand(dir, "js", true)).toThrow("could not read");
		expect(readFileSync(join(dir, ".opx", "config.json"), "utf8")).toBe("{oops");
	});
});
