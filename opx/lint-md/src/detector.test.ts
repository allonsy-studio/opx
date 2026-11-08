import { tmpdir } from "node:os";

import { jest } from "@jest/globals";
import type { Detector, DetectorContext } from "@allons-y/opx";

const runner = jest.fn<(ctx: DetectorContext, args: string[]) => Promise<number>>().mockResolvedValue(0);
jest.unstable_mockModule("./runner.js", () => ({ __esModule: true, default: runner }));

const { default: detector } = await import("./detector.js");
const d = detector as Detector;

function ctx(fileTypes: Set<string>): DetectorContext {
	return { fileTypes } as unknown as DetectorContext;
}

describe("opx-lint-md detector", () => {
	it("detects when an owned extension is present", () => {
		expect(d.detect(ctx(new Set([".md"])))).toBe(true);
	});

	it("detects an .mdx-only repository", () => {
		expect(d.detect(ctx(new Set([".mdx"])))).toBe(true);
	});

	it("does not detect when no owned extension is present", () => {
		expect(d.detect(ctx(new Set([".ts"])))).toBe(false);
	});

	it("passes run() straight to the runner", async () => {
		runner.mockResolvedValueOnce(1);
		const c = ctx(new Set());
		expect(await d.run!(c, ["a.md"])).toBe(1);
		expect(runner).toHaveBeenCalledWith(c, ["a.md"]);
	});
});

describe("@allons-y/opx-lint-md cleanup", () => {
	const ctx = { cwd: tmpdir(), config: { version: 1, lint: {} } } as unknown as DetectorContext;
	const bundled = d.describe(ctx).bundledDeps;

	it("suggests exactly the packages it bundles", () => {
		const suggestions = d.cleanup!(ctx);
		expect(suggestions.filter((s) => s.kind === "dependency").map((s) => s.target)).toEqual(bundled);
	});

	it("says which version of each package it ships", () => {
		for (const s of d.cleanup!(ctx).filter((s) => s.kind === "dependency")) expect(s.reason).toMatch(/ at \d+\.\d+\.\d+/);
	});
});
