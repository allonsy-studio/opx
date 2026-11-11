import { jest } from "@jest/globals";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Logger, PackageJson } from "./detector.js";
import { isValidPluginName, loadPlugins, normalizeDetectorId, resolvePluginPackageName } from "./registry.js";

function captureLogger(): Logger & { warnings: string[] } {
	const warnings: string[] = [];
	return { warnings, info: () => {}, warn: (m) => warnings.push(m), error: () => {}, debug: () => {} };
}

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A detector module's source with the given default export. */
const detector = (shortName: string) => `{ id: "x", shortName: "${shortName}", displayName: "", concern: "lint", detect: () => true, describe: () => ({ summary: "", bundledDeps: [] }) }`;

/**
 * A host project, outside this repository, with plugin packages installed under
 * `node_modules`. Each package is ESM and exports its entry only for `import`,
 * as the first-party plugins do.
 */
function host(packages: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-plugins-"));
	dirs.push(dir);
	for (const [name, source] of Object.entries(packages)) {
		const pkg = join(dir, "node_modules", name);
		mkdirSync(join(pkg, "bin"), { recursive: true });
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name, type: "module", exports: { ".": { import: "./bin/index.js" } } }));
		writeFileSync(join(pkg, "bin", "index.js"), source);
	}
	return dir;
}

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
	const options = (cwd: string, hostPkg: PackageJson) => ({ hostPkg, cwd, logger: captureLogger() });

	it("warns and skips an entry with no installed package", async () => {
		const opts = options(host({}), {});
		expect(await loadPlugins(["lint-css"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("no matching package is installed");
	});

	it("warns and skips a package that violates the naming convention", async () => {
		const opts = options(host({}), { dependencies: { "@scope/bad": "1" } });
		expect(await loadPlugins(["@scope/bad"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("naming convention");
	});

	it("warns when a declared package isn't on disk", async () => {
		const opts = options(host({}), { dependencies: { "@allons-y/opx-nonexistent": "1" } });
		expect(await loadPlugins(["nonexistent"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("failed to import");
	});

	it("loads a plugin from the host project's node_modules, which the engine itself can't see", async () => {
		const cwd = host({ "opx-plugin-good": `export default ${detector("good")};\n` });
		const opts = options(cwd, { devDependencies: { "opx-plugin-good": "1" } });
		const loaded = await loadPlugins(["opx-plugin-good"], opts);
		expect(loaded.map((p) => [p.id, p.detectors[0]?.shortName])).toEqual([["opx-plugin-good", "good"]]);
		expect(opts.logger.warnings).toEqual([]);
	});

	it("finds plugins in a parent folder's node_modules, as from a workspace package", async () => {
		const root = host({ "opx-plugin-good": `export default ${detector("good")};\n` });
		const workspace = join(root, "packages", "app");
		mkdirSync(workspace, { recursive: true });
		const loaded = await loadPlugins(["opx-plugin-good"], options(workspace, { devDependencies: { "opx-plugin-good": "1" } }));
		expect(loaded).toHaveLength(1);
	});

	it("loads a default export that is an array of detectors", async () => {
		const cwd = host({ "opx-plugin-many": `export default [${detector("a")}, ${detector("b")}];\n` });
		const loaded = await loadPlugins(["opx-plugin-many"], options(cwd, { dependencies: { "opx-plugin-many": "1" } }));
		expect(loaded[0]?.detectors.map((d) => d.shortName)).toEqual(["a", "b"]);
	});

	it("warns when the package has no default Detector export", async () => {
		const cwd = host({ "opx-plugin-none": "export const notDefault = 1;\n" });
		const opts = options(cwd, { dependencies: { "opx-plugin-none": "1" } });
		expect(await loadPlugins(["opx-plugin-none"], opts)).toEqual([]);
		expect(opts.logger.warnings[0]).toContain("did not export a default Detector");
	});

	it("reports skips to onSkip instead of the logger", async () => {
		const opts = { ...options(host({}), {}), onSkip: jest.fn() };
		await loadPlugins(["lint-css"], opts);
		expect(opts.onSkip).toHaveBeenCalledWith("lint-css", expect.stringContaining("no matching package is installed"));
		expect(opts.logger.warnings).toEqual([]);
	});
});
