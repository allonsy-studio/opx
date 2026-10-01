import { jest } from "@jest/globals";

import type { Detector, DetectorContext } from "@allons-y/opx";

import builtIns from "../built-in.js";
import { runLintCommand } from "./lint.js";

function ctx(fix = false): DetectorContext {
	return {
		cwd: process.cwd(),
		fileTypes: new Set<string>(),
		hostPkg: {},
		pkgManager: "npm",
		config: { version: 1, lint: {}, build: {}, release: false, test: false },
		state: { version: 1, deferrals: {} },
		branch: "main",
		logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
		dryRun: false,
		fix,
		write: () => {},
	} as unknown as DetectorContext;
}

function detector(over: Partial<Detector>): Detector {
	return { id: "x", shortName: "x", displayName: "X", concern: "lint", ...over } as unknown as Detector;
}

describe("runLintCommand", () => {
	let load: ReturnType<typeof jest.spyOn>;
	let log: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		jest.spyOn(process.stdout, "write").mockImplementation(() => true);
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		load = jest.spyOn(builtIns, "load");
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns 0 and points at init when no linters are enabled", async () => {
		load.mockResolvedValue([]);
		expect(await runLintCommand(ctx(), [])).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no linters are detected");
	});

	it("runs only lint-concern detectors", async () => {
		const lint = jest.fn(async () => 0);
		const build = jest.fn(async () => 0);
		const release = jest.fn(async () => 0);
		load.mockResolvedValue([
			detector({ shortName: "js", concern: "lint", run: lint }),
			detector({ shortName: "bundle", concern: "build", run: build }),
			detector({ shortName: "release", concern: "release", run: release }),
		]);
		expect(await runLintCommand(ctx(), [])).toBe(0);
		expect(lint).toHaveBeenCalledTimes(1);
		expect(build).not.toHaveBeenCalled();
		expect(release).not.toHaveBeenCalled();
	});

	it("reports no linters when only non-lint detectors are loaded", async () => {
		load.mockResolvedValue([detector({ concern: "build" })]);
		expect(await runLintCommand(ctx(), [])).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no linters are detected");
	});

	it("forwards paths and flags to every runner", async () => {
		const first = jest.fn<NonNullable<Detector["run"]>>().mockResolvedValue(0);
		const second = jest.fn<NonNullable<Detector["run"]>>().mockResolvedValue(0);
		load.mockResolvedValue([detector({ shortName: "a", run: first }), detector({ shortName: "b", run: second })]);
		await runLintCommand(ctx(), ["src", "README.md"]);
		expect(first.mock.calls[0]?.[1]).toEqual(["src", "README.md"]);
		expect(second.mock.calls[0]?.[1]).toEqual(["src", "README.md"]);
	});

	it("hands each runner a context that carries the --fix flag", async () => {
		const seen: boolean[] = [];
		load.mockResolvedValue([detector({ run: async (c: DetectorContext) => (seen.push(c.fix), 0) })]);
		await runLintCommand(ctx(true), []);
		await runLintCommand(ctx(false), []);
		expect(seen).toEqual([true, false]);
	});

	it("returns the first non-zero exit code", async () => {
		load.mockResolvedValue([
			detector({ shortName: "a", run: async () => 0 }),
			detector({ shortName: "b", run: async () => 3 }),
			detector({ shortName: "c", run: async () => 5 }),
		]);
		expect(await runLintCommand(ctx(), [])).toBe(3);
	});
});
