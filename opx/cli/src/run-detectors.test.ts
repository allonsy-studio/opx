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
				detector({
					shortName: "b",
					run: async (c: DetectorContext) => {
						c.write("noise");
						return 0;
					},
				}),
			],
			[],
		);
		expect(code).toBe(0);
		const out = spy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
		expect(out).toContain("All checks passed");
		expect(out).toContain("noise");
	});

	it("returns the first non-zero exit code when a detector fails", async () => {
		const code = await runDetectorsGrouped(
			ctx(),
			[
				detector({ shortName: "ok", run: async () => 0 }),
				detector({
					shortName: "bad",
					run: async (c) => {
						c.write("boom");
						return 2;
					},
				}),
			],
			[],
		);
		expect(code).toBe(2);
		const out = spy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
		expect(out).toContain("Some checks failed");
		expect(out).toContain("boom");
	});

	it("prints each detector's output in detector order, not finish order", async () => {
		const slow = detector({
			shortName: "slow",
			run: async (c) => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				c.write("slow output");
				return 0;
			},
		});
		const fast = detector({
			shortName: "fast",
			run: async (c) => {
				c.write("fast output");
				return 0;
			},
		});
		await runDetectorsGrouped(ctx(), [slow, fast], []);
		const out = spy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
		expect(out.indexOf("fast output")).toBeGreaterThan(-1);
		expect(out.indexOf("slow")).toBeLessThan(out.indexOf("slow output"));
		expect(out.indexOf("slow output")).toBeLessThan(out.indexOf("fast"));
	});

	describe("phases", () => {
		/** Detectors that log when they start and finish, so ordering is visible. */
		function tracked(
			events: string[],
			shortName: string,
			phase?: "format" | "check",
			delay = 0,
			code = 0,
		): Detector {
			return detector({
				shortName,
				phase,
				run: async () => {
					events.push(`start ${shortName}`);
					await new Promise((resolve) => setTimeout(resolve, delay));
					events.push(`end ${shortName}`);
					return code;
				},
			});
		}

		it("finishes every format detector before any check detector starts", async () => {
			const events: string[] = [];
			await runDetectorsGrouped(ctx(), [tracked(events, "js"), tracked(events, "format", "format", 20)], []);
			expect(events.indexOf("end format")).toBeLessThan(events.indexOf("start js"));
		});

		it("runs format detectors one at a time, in order", async () => {
			const events: string[] = [];
			await runDetectorsGrouped(
				ctx(),
				[tracked(events, "f1", "format", 10), tracked(events, "f2", "format")],
				[],
			);
			expect(events).toEqual(["start f1", "end f1", "start f2", "end f2"]);
		});

		it("still runs check detectors in parallel, whether the phase is set or defaulted", async () => {
			const events: string[] = [];
			await runDetectorsGrouped(
				ctx(),
				[tracked(events, "a", "check", 10), tracked(events, "b", undefined, 10)],
				[],
			);
			expect(events.slice(0, 2)).toEqual(["start a", "start b"]);
		});

		it("runs the check detectors even when a format detector fails, and reports its code first", async () => {
			const events: string[] = [];
			const code = await runDetectorsGrouped(
				ctx(),
				[tracked(events, "js", "check", 0, 3), tracked(events, "format", "format", 0, 1)],
				[],
			);
			expect(events).toContain("end js");
			expect(code).toBe(1);
		});

		it("prints format output before check output, whatever the detector order", async () => {
			const writer = (shortName: string, phase?: "format"): Detector =>
				detector({
					shortName,
					phase,
					run: async (c) => {
						c.write(`${shortName} output`);
						return 0;
					},
				});
			await runDetectorsGrouped(ctx(), [writer("js"), writer("format", "format")], []);
			const out = spy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
			expect(out.indexOf("format output")).toBeLessThan(out.indexOf("js output"));
		});
	});

	it("treats a detector without a run function as passing (code 0)", async () => {
		const code = await runDetectorsGrouped(ctx(), [detector({ shortName: "noop" })], []);
		expect(code).toBe(0);
		const out = spy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
		expect(out).toContain("no issues");
	});

	it("hands each detector a full copy of the context that survives a spread", async () => {
		let keys: string[] = [];
		const copier = detector({
			shortName: "copier",
			run: async (runCtx) => {
				keys = Object.keys({ ...runCtx, fix: true });
				return 0;
			},
		});
		await runDetectorsGrouped(ctx(), [copier], []);
		expect(keys).toEqual(
			expect.arrayContaining(["cwd", "fileTypes", "hostPkg", "config", "branch", "logger", "write", "fix"]),
		);
	});

	it("keeps the context lazy: unread getters are not evaluated, read ones still work", async () => {
		let reads = 0;
		const lazy = ctx();
		Object.defineProperty(lazy, "fileTypes", {
			get: () => {
				reads++;
				return new Set([".ts"]);
			},
			enumerable: true,
		});

		const quiet = detector({ shortName: "quiet", run: async () => 0 });
		await runDetectorsGrouped(lazy, [quiet], []);
		expect(reads).toBe(0);

		let seen: string[] = [];
		const reader = detector({
			shortName: "reader",
			run: async (runCtx) => {
				seen = [...runCtx.fileTypes];
				return 0;
			},
		});
		await runDetectorsGrouped(lazy, [reader], []);
		expect(seen).toEqual([".ts"]);
		expect(reads).toBe(1);
	});
});
