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

	beforeEach(() => {
		// Swallow the grouped output so the test log stays clean.
		jest.spyOn(process.stdout, "write").mockImplementation(() => true);
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		load = jest.spyOn(builtIns, "loadTask");
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns 0 and reports when no builders are detected", async () => {
		load.mockResolvedValue({ detectors: [], failures: [] });

		const code = await runBuildCommand(ctx(), []);

		expect(code).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no builders are detected");
	});

	it("exits 1 instead of reporting no builders when an enabled builder can't be loaded", async () => {
		jest.spyOn(process.stderr, "write").mockImplementation(() => true);
		load.mockResolvedValue({ detectors: [], failures: ["broken"] });
		expect(await runBuildCommand(ctx(), [])).toBe(1);
		expect(log.mock.calls.flat().join(" ")).not.toContain("no builders are detected");
	});

	it("forwards the build paths to each builder's runner", async () => {
		const seen: string[][] = [];
		load.mockResolvedValue({ detectors: [
			detector({ run: async (_c, paths) => { seen.push(paths); return 0; } }),
		], failures: [] });

		const code = await runBuildCommand(ctx(), ["src/a.ts", "src/b.ts"]);

		expect(code).toBe(0);
		expect(seen).toEqual([["src/a.ts", "src/b.ts"]]);
	});
});
