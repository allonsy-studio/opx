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

	it("warns on stderr when saving drops a key opx doesn't know", () => {
		const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
		const dir = project({ version: 1, custom: { keep: 1 } });
		expect(await runToggleCommand(dir, "js", true)).toBe(0);
		expect(configOf(dir).custom).toBeUndefined();
		expect(said(stderr)).toMatch(/▲ Removed a key opx doesn't know from \.opx\/config\.json: "custom"/);
	});

	it("enables a plugin, creating the config if there isn't one", async () => {
		const dir = project();
		expect(await runToggleCommand(dir, "js", true)).toBe(0);
		expect(configOf(dir).lint).toEqual({ js: true });
		expect(said(log)).toContain('enabled "js" in lint');
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
