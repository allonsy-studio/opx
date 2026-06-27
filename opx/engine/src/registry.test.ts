import { jest } from "@jest/globals";

import type { Logger, PackageJson } from "./detector.js";

function captureLogger(): Logger & { warnings: string[] } {
	const warnings: string[] = [];
	return { warnings, info: () => {}, warn: (m) => warnings.push(m), error: () => {}, debug: () => {} };
}

const fakeDetector = { id: "@allons-y/opx-lint-js", shortName: "good", displayName: "", concern: "lint", detect: () => true, describe: () => ({ summary: "", bundledDeps: [] }) };

// Mock real (resolvable) package names so the dynamic import() inside loadPlugins
// returns controlled module shapes for each branch.
jest.unstable_mockModule("@allons-y/opx-lint-js", () => ({ __esModule: true, default: fakeDetector }));
jest.unstable_mockModule("@allons-y/opx-lint-md", () => ({ __esModule: true, default: [{ shortName: "a" }, { shortName: "b" }] }));
jest.unstable_mockModule("@allons-y/opx-lint-json", () => ({ __esModule: true, notDefault: 1 }));

const { isValidPluginName, loadPlugins, normalizeDetectorId, resolvePluginPackageName } = await import("./registry.js");

describe("isValidPluginName", () => {
	it("accepts official, community, and scoped community names", () => {
		expect(isValidPluginName("@allons-y/opx-lint-js")).toBe(true);
		expect(isValidPluginName("opx-plugin-foo")).toBe(true);
		expect(isValidPluginName("@scope/opx-plugin-foo")).toBe(true);
	});

	it("rejects names outside the convention", () => {
		expect(isValidPluginName("@scope/not-a-plugin")).toBe(false);
		expect(isValidPluginName("random-pkg")).toBe(false);
	});
});

describe("resolvePluginPackageName", () => {
	it("expands a short slug to official + community candidates", () => {
		expect(resolvePluginPackageName("lint-js")).toEqual(["@allons-y/opx-lint-js", "opx-plugin-lint-js"]);
	});

	it("passes through scoped and community-prefixed names verbatim", () => {
		expect(resolvePluginPackageName("@scope/opx-plugin-x")).toEqual(["@scope/opx-plugin-x"]);
		expect(resolvePluginPackageName("opx-plugin-x")).toEqual(["opx-plugin-x"]);
	});
});

describe("normalizeDetectorId", () => {
	const pkg: PackageJson = { dependencies: { "@allons-y/opx-lint-js": "1" }, devDependencies: { "opx-plugin-x": "1" } };

	it("resolves a candidate present in deps or devDeps", () => {
		expect(normalizeDetectorId("lint-js", pkg)).toBe("@allons-y/opx-lint-js");
		expect(normalizeDetectorId("x", pkg)).toBe("opx-plugin-x");
	});

	it("returns null when no candidate is installed", () => {
		expect(normalizeDetectorId("missing", pkg)).toBeNull();
	});
});

describe("loadPlugins", () => {
	const base = (hostPkg: PackageJson) => ({ hostPkg, cwd: process.cwd(), logger: captureLogger() });

	it("warns and skips an entry with no installed package", async () => {
		const opts = base({});
		expect(await loadPlugins(["lint-css"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("no matching package is installed");
	});

	it("warns and skips a package that violates the naming convention", async () => {
		const opts = base({ dependencies: { "@scope/bad": "1" } });
		expect(await loadPlugins(["@scope/bad"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("naming convention");
	});

	it("warns when an installed package fails to import", async () => {
		const opts = base({ dependencies: { "@allons-y/opx-nonexistent": "1" } });
		expect(await loadPlugins(["nonexistent"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("failed to import");
	});

	it("loads a single default-exported detector", async () => {
		const opts = base({ dependencies: { "@allons-y/opx-lint-js": "1" } });
		const loaded = await loadPlugins(["lint-js"], opts);
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.detectors[0]?.shortName).toBe("good");
		expect(opts.logger.warnings).toEqual([]);
	});

	it("loads a default export that is an array of detectors", async () => {
		const opts = base({ dependencies: { "@allons-y/opx-lint-md": "1" } });
		const loaded = await loadPlugins(["lint-md"], opts);
		expect(loaded[0]?.detectors).toHaveLength(2);
	});

	it("warns when the package has no default Detector export", async () => {
		const opts = base({ dependencies: { "@allons-y/opx-lint-json": "1" } });
		expect(await loadPlugins(["lint-json"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("did not export a default Detector");
	});
});
