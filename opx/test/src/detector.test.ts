import { jest } from "@jest/globals";

import type { DetectorContext } from "@allons-y/opx";

jest.unstable_mockModule("./runner.js", () => ({
	__esModule: true,
	runTest: jest.fn(async () => 42),
}));

const { runTest } = await import("./runner.js");
const { opxTestDetector } = await import("./detector.js");

const ctx = (test: unknown) => ({ cwd: "/tmp", config: { version: 1, test } }) as unknown as DetectorContext;

describe("opxTestDetector", () => {
	it.each([
		[true, true],
		[{ coverage: { lines: 98 } }, true],
		[false, false],
		[undefined, false],
	])("applies when config.test is %j: %s", (setting, expected) => {
		expect(opxTestDetector.detect(ctx(setting))).toBe(expected);
	});

	it("belongs to the test task", () => {
		expect(opxTestDetector).toMatchObject({ id: "@allons-y/opx-test", shortName: "test", concern: "test" });
	});

	it("lists exactly the third-party packages it ships, pinned", async () => {
		const { readFileSync } = await import("node:fs");
		const { fileURLToPath } = await import("node:url");
		const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { dependencies: Record<string, string> };
		const bundled = Object.entries(pkg.dependencies).filter(([name]) => !name.startsWith("@allons-y/"));

		expect(opxTestDetector.describe(ctx(true)).bundledDeps).toEqual(bundled.map(([name]) => name));
		for (const [, version] of bundled) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("runs the tests with the arguments it was given and returns their exit code", async () => {
		const context = ctx(true);

		expect(await opxTestDetector.run!(context, ["--coverage"])).toBe(42);
		expect(runTest).toHaveBeenCalledWith(context, ["--coverage"]);
	});
});
