import { jest } from "@jest/globals";

import type { Detector, DetectorContext } from "@allons-y/opx";

import builtIns from "../built-in.js";
import { runBuildCommand } from "./build.js";

function ctx(): DetectorContext {
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
		fix: false,
		write: () => {},
	} as unknown as DetectorContext;
}

function detector(over: Partial<Detector>): Detector {
	return { id: "x", shortName: "x", displayName: "X", concern: "build", ...over } as unknown as Detector;
}

describe("runBuildCommand", () => {
	let load: ReturnType<typeof jest.spyOn>;
	let log: ReturnType<typeof jest.spyOn>;
	let stdout: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		// Swallow the grouped output so the test log stays clean.
		stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		load = jest.spyOn(builtIns, "load");
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns 0 and reports when no builders are detected", async () => {
		load.mockResolvedValue([]);

		const code = await runBuildCommand(ctx(), []);

		expect(code).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no builders are detected");
	});

	it("ignores detectors whose concern is not build", async () => {
		load.mockResolvedValue([detector({ concern: "lint", run: async () => 2 })]);

		const code = await runBuildCommand(ctx(), []);

		// The lone lint detector is filtered out, so it behaves as "no builders".
		expect(code).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no builders are detected");
	});

	it("forwards the build paths to each builder's runner", async () => {
		const seen: string[][] = [];
		load.mockResolvedValue([
			detector({ run: async (_c, paths) => { seen.push(paths); return 0; } }),
		]);

		const code = await runBuildCommand(ctx(), ["src/a.ts", "src/b.ts"]);

		expect(code).toBe(0);
		expect(seen).toEqual([["src/a.ts", "src/b.ts"]]);
	});

	it("returns the first non-zero exit code from a failing builder", async () => {
		load.mockResolvedValue([
			detector({ shortName: "ok", run: async () => 0 }),
			detector({ shortName: "bad", run: async () => 3 }),
		]);

		const code = await runBuildCommand(ctx(), []);

		expect(code).toBe(3);
		// Sanity: the grouped runner produced output rather than the empty branch.
		expect(stdout).toHaveBeenCalled();
	});
});
