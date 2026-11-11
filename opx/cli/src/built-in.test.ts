import { jest } from "@jest/globals";

import type { DetectorContext } from "@allons-y/opx";

const fakeDetector = {
	id: "@allons-y/opx-lint-js",
	shortName: "js",
	displayName: "JavaScript",
	concern: "lint",
	detect: () => true,
	describe: () => ({ summary: "", bundledDeps: [] }),
};

jest.unstable_mockModule("@allons-y/opx-lint-js", () => ({ __esModule: true, default: fakeDetector }), { virtual: true });

const { PLUGIN_CATALOG } = await import("./plugin-catalog.js");
const { suggest, virtualDetectors, load, PACKAGE_HINTS, SUPPORTED_FILE_EXTS, UNDETECTABLE_PLUGINS } =
	await import("./built-in.js");

function ctx(partial: Partial<DetectorContext>): DetectorContext {
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
		...partial,
	} as unknown as DetectorContext;
}

describe("derived constants", () => {
	it("SUPPORTED_FILE_EXTS contains detectable short names only", () => {
		expect(SUPPORTED_FILE_EXTS).toEqual(expect.arrayContaining(["js", "md", "json"]));
		expect(SUPPORTED_FILE_EXTS).not.toContain("release");
		expect(SUPPORTED_FILE_EXTS).not.toContain("test");
	});

	it("UNDETECTABLE_PLUGINS contains plugins with no extensions", () => {
		expect(UNDETECTABLE_PLUGINS).toEqual(expect.arrayContaining(["release"]));
		expect(UNDETECTABLE_PLUGINS).not.toContain("js");
	});

	it("PACKAGE_HINTS maps every short name to its packages", () => {
		expect(PACKAGE_HINTS.js).toContain("@allons-y/opx-lint-js");
		expect(PACKAGE_HINTS.release).toContain("@allons-y/opx-release");
	});
});

describe("suggest", () => {
	it("returns short names whose extensions appear in the file set", () => {
		expect(suggest(new Set([".md"]))).toContain("md");
		expect(suggest(new Set([".mjs"]))).toEqual(["js"]);
	});

	it("returns empty when nothing matches", () => {
		expect(suggest(new Set([".unknown"]))).toEqual([]);
	});

	it("suggests only catalog entries with a matching extension", () => {
		const types = new Set([".css", ".scss", ".py", ".md"]);
		expect(suggest(types).length).toBeGreaterThan(0);
		for (const name of suggest(types)) {
			const entry = PLUGIN_CATALOG.find((e) => e.shortName === name);
			expect(entry?.extensions.some((ext) => types.has(ext))).toBe(true);
		}
	});
});

describe("virtualDetectors", () => {
	it("includes matched detectors and undetectable plugins, flagging installed packages", () => {
		const result = virtualDetectors(new Set([".md"]), {
			dependencies: { "@allons-y/opx-lint-md": "1" },
		});
		const md = result.find((r) => r.pkg === "@allons-y/opx-lint-md");
		expect(md?.installed).toBe(true);
		expect(md?.reason).toContain("committed tree");

		const release = result.find((r) => r.shortName === "release");
		expect(release).toBeDefined();
		expect(release?.reason).toBe("Not detectable from files; enable it if you publish packages.");
		expect(release?.installed).toBe(false);
	});

	it("suggests ts for TypeScript files and says it needs typescript", () => {
		const result = virtualDetectors(new Set([".ts", ".js"]), {});
		expect(result.find((r) => r.shortName === "ts")).toMatchObject({ pkg: "@allons-y/opx-lint-ts", requires: ["typescript"] });
		expect(virtualDetectors(new Set([".js"]), {}).some((r) => r.shortName === "ts")).toBe(false);
	});

	it("matches every extension the lint-ts detector owns", () => {
		for (const ext of [".ts", ".tsx", ".mts", ".cts"]) expect(suggest(new Set([ext]))).toEqual(["ts"]);
	});

	it("works with no deps and no matches (still lists undetectable plugins)", () => {
		const result = virtualDetectors(new Set(), {});
		expect(result.every((r) => r.installed === false)).toBe(true);
		expect(result.some((r) => r.shortName === "release")).toBe(true);
	});
});

describe("load", () => {
	it("returns [] when nothing is configured/installed", async () => {
		const loaded = await load(ctx({ hostPkg: {}, config: { version: 1, lint: {}, build: {}, release: false, test: false } }));
		expect(loaded).toEqual([]);
	});

	it("loads an installed, configured lint detector", async () => {
		const loaded = await load(
			ctx({
				hostPkg: { dependencies: { "@allons-y/opx-lint-js": "1" } },
				config: { version: 1, lint: { js: true }, build: {}, release: false, test: false },
			}),
		);
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.shortName).toBe("js");
	});

	it("loads the release plugin when release holds settings", async () => {
		const loaded = await load(
			ctx({
				hostPkg: { devDependencies: { "@allons-y/opx-release": "1" } },
				config: { version: 1, lint: {}, build: {}, release: { githubReleases: false }, test: false },
			}),
		);
		expect(loaded.map((d) => d.shortName)).toEqual(["release"]);
	});

	it("loads an installed plugin enabled by package id, once, even under two tasks", async () => {
		const loaded = await load(
			ctx({
				hostPkg: { dependencies: { "@allons-y/opx-lint-js": "1" } },
				config: { version: 1, lint: { "@allons-y/opx-lint-js": true }, build: { "@allons-y/opx-lint-js": true, js: true }, release: false, test: false },
			}),
		);
		expect(loaded).toHaveLength(1);
	});

	it("ignores configured detectors that are not installed", async () => {
		const loaded = await load(
			ctx({
				hostPkg: {},
				config: { version: 1, lint: { css: true }, build: { ts: true }, release: true, test: true },
			}),
		);
		expect(loaded).toEqual([]);
	});
});
