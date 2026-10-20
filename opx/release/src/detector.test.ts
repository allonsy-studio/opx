import { jest } from "@jest/globals";

import type { DetectorContext } from "@allons-y/opx";

jest.unstable_mockModule("./runner.js", () => ({
	__esModule: true,
	runRelease: jest.fn(async () => 42),
	init: jest.fn(() => true),
}));

const { runRelease } = await import("./runner.js");
const { opxReleaseDetector } = await import("./detector.js");

function ctx(release: unknown): DetectorContext {
	return {
		cwd: "/tmp",
		config: { version: 1, release },
	} as unknown as DetectorContext;
}

describe("opxReleaseDetector", () => {
	it("has the expected identity metadata", () => {
		expect(opxReleaseDetector.id).toBe("@allons-y/opx-release");
		expect(opxReleaseDetector.shortName).toBe("release");
		expect(opxReleaseDetector.concern).toBe("release");
	});

	describe("detect", () => {
		it("is true when config.release is defined (truthy)", () => {
			expect(opxReleaseDetector.detect(ctx(true))).toBe(true);
		});

		it("is true when config.release is defined (falsy but present)", () => {
			expect(opxReleaseDetector.detect(ctx(false))).toBe(true);
		});

		it("is false when config.release is undefined", () => {
			expect(opxReleaseDetector.detect(ctx(undefined))).toBe(false);
		});
	});

	describe("describe", () => {
		it("returns a summary and the bundled deps", () => {
			const d = opxReleaseDetector.describe!(ctx(true));
			expect(d.summary).toMatch(/changesets/i);
			expect(d.bundledDeps).toEqual([
				"@changesets/cli",
				"@changesets/get-github-info",
				"@changesets/write",
				"@clack/prompts",
				"@manypkg/get-packages",
			]);
		});
	});

	describe("dependencies", () => {
		it("pins the tools it ships to exact versions", async () => {
			const { readFileSync } = await import("node:fs");
			const { fileURLToPath } = await import("node:url");
			const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { dependencies: Record<string, string> };
			for (const [name, version] of Object.entries(pkg.dependencies)) {
				if (!name.startsWith("@allons-y/")) expect({ name, version }).toEqual({ name, version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
			}
		});
	});

	describe("run", () => {
		it("delegates to runRelease and returns its exit code", async () => {
			const c = ctx(true);
			const code = await opxReleaseDetector.run!(c, ["status"]);
			expect(code).toBe(42);
			expect(runRelease).toHaveBeenCalledWith(c, ["status"]);
		});
	});
});
