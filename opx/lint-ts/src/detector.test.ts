import type { DetectorContext } from "@allons-y/opx";

import { opxLintTsDetector } from "./detector.js";

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

	it("describes its summary and bundled deps", () => {
		const desc = opxLintTsDetector.describe(ctx(new Set()));
		expect(desc.summary).toContain("ESLint");
		expect(desc.bundledDeps).toContain("eslint");
		expect(desc.bundledDeps.length).toBeGreaterThan(0);
	});

	it("delegates run() to the runner against a clean file", async () => {
		const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const dir = mkdtempSync(join(tmpdir(), "opx-lint-"));
		mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
		writeFileSync(join(dir, "clean.ts"), "export const ok = 1;\n");
		const c = {
			cwd: dir,
			config: { version: 1, lint: {} },
			fix: false,
			write: () => {},
			fileTypes: new Set(),
		} as unknown as DetectorContext;
		expect(await opxLintTsDetector.run!(c, ["clean.ts"])).toBe(0);
	});
});
