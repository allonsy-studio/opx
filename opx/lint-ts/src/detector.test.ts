import { tmpdir } from "node:os";

import { jest } from "@jest/globals";
import type { DetectorContext } from "@allons-y/opx";

const runEslint = jest.fn<(ctx: DetectorContext, args: string[]) => Promise<number>>().mockResolvedValue(0);
jest.unstable_mockModule("./runner.js", () => ({ __esModule: true, runEslint }));

const { opxLintTsDetector } = await import("./detector.js");

function ctx(fileTypes: Set<string>): DetectorContext {
	return { fileTypes } as unknown as DetectorContext;
}

describe("opxLintTsDetector", () => {
	it("detects when an owned extension is present", () => {
		expect(opxLintTsDetector.detect(ctx(new Set([".ts"])))).toBe(true);
	});

	it("does not detect when no owned extension is present", () => {
		expect(opxLintTsDetector.detect(ctx(new Set([".json"])))).toBe(false);
	});

	it("passes run() straight to the runner", async () => {
		runEslint.mockResolvedValueOnce(1);
		const c = ctx(new Set());
		expect(await opxLintTsDetector.run!(c, ["a.ts"])).toBe(1);
		expect(runEslint).toHaveBeenCalledWith(c, ["a.ts"]);
	});
});

describe("@allons-y/opx-lint-ts cleanup", () => {
	const ctx = { cwd: tmpdir(), config: { version: 1, lint: {} } } as unknown as DetectorContext;
	const bundled = opxLintTsDetector.describe(ctx).bundledDeps;

	it("suggests exactly the packages it bundles", () => {
		const suggestions = opxLintTsDetector.cleanup!(ctx);
		expect(suggestions.filter((s) => s.kind === "dependency").map((s) => s.target)).toEqual(bundled);
	});

	it("says which version of each package it ships", () => {
		for (const s of opxLintTsDetector.cleanup!(ctx).filter((s) => s.kind === "dependency")) expect(s.reason).toMatch(/ at \d+\.\d+\.\d+/);
	});
});
