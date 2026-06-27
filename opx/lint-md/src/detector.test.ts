import type { Detector, DetectorContext } from "@allons-y/opx";

import detector from "./detector.js";

const d = detector as Detector;

function ctx(fileTypes: Set<string>): DetectorContext {
	return { fileTypes } as unknown as DetectorContext;
}

describe("opx-lint-md detector", () => {
	it("detects when an owned extension is present", () => {
		expect(d.detect(ctx(new Set([".md"])))).toBe(true);
	});

	it("does not detect when no owned extension is present", () => {
		expect(d.detect(ctx(new Set([".ts"])))).toBe(false);
	});

	it("describes its summary and bundled deps", () => {
		const desc = d.describe(ctx(new Set()));
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
		writeFileSync(join(dir, "clean.md"), "# Title\n\nText.\n");
		const c = {
			cwd: dir,
			config: { version: 1, lint: {} },
			fix: false,
			write: () => {},
			fileTypes: new Set(),
		} as unknown as DetectorContext;
		expect(await d.run!(c, ["clean.md"])).toBe(0);
	});
});
