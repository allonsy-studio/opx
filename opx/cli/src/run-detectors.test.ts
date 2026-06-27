import { jest } from "@jest/globals";

import type { Detector, DetectorContext } from "@allons-y/opx";

import { runDetectorsGrouped } from "./run-detectors.js";

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
	return { id: "x", shortName: "x", displayName: "X", concern: "lint", ...over } as unknown as Detector;
}

describe("runDetectorsGrouped", () => {
	let spy: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		spy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		spy.mockRestore();
	});

	it("returns 0 when all detectors pass and writes grouped output", async () => {
		const code = await runDetectorsGrouped(
			ctx(),
			[
				detector({ shortName: "a", run: async () => 0 }),
				detector({ shortName: "b", run: async (c) => { c.write("noise"); return 0; } }),
			],
			[],
		);
		expect(code).toBe(0);
		const out = spy.mock.calls.map((c) => String(c[0])).join("");
		expect(out).toContain("All checks passed");
		expect(out).toContain("noise");
	});

	it("returns the first non-zero exit code when a detector fails", async () => {
		const code = await runDetectorsGrouped(
			ctx(),
			[
				detector({ shortName: "ok", run: async () => 0 }),
				detector({ shortName: "bad", run: async (c) => { c.write("boom"); return 2; } }),
			],
			[],
		);
		expect(code).toBe(2);
		const out = spy.mock.calls.map((c) => String(c[0])).join("");
		expect(out).toContain("Some checks failed");
		expect(out).toContain("boom");
	});

	it("treats a detector without a run function as passing (code 0)", async () => {
		const code = await runDetectorsGrouped(ctx(), [detector({ shortName: "noop" })], []);
		expect(code).toBe(0);
		const out = spy.mock.calls.map((c) => String(c[0])).join("");
		expect(out).toContain("no issues");
	});
});
