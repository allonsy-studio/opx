import { jest } from "@jest/globals";
import type { DetectorContext } from "@allons-y/opx";

const runFormat = jest.fn<(ctx: DetectorContext, args: string[]) => Promise<number>>().mockResolvedValue(0);
jest.unstable_mockModule("./runner.js", () => ({ __esModule: true, runFormat }));

const { opxFormatDetector: detector } = await import("./detector.js");

/** A context with only the file types the detector reads. */
function ctx(fileTypes: Set<string>): DetectorContext {
	return { fileTypes } as unknown as DetectorContext;
}

describe("opx-format detector", () => {
	it("runs in the format phase of the lint task", () => {
		expect(detector.phase).toBe("format");
		expect(detector.concern).toBe("lint");
		expect(detector.shortName).toBe("format");
	});

	it("detects when any file type opx lints is present", () => {
		expect(detector.detect(ctx(new Set([".md"])))).toBe(true);
		expect(detector.detect(ctx(new Set([".tsx"])))).toBe(true);
	});

	it("does not detect when none is present", () => {
		expect(detector.detect(ctx(new Set([".css"])))).toBe(false);
	});

	it("bundles Prettier", () => {
		expect(detector.describe({} as DetectorContext).bundledDeps).toEqual(["prettier"]);
	});

	it("passes run() to the runner", async () => {
		runFormat.mockResolvedValueOnce(1);
		const c = ctx(new Set());
		expect(await detector.run!(c, ["a.md"])).toBe(1);
		expect(runFormat).toHaveBeenCalledWith(c, ["a.md"]);
	});
});
