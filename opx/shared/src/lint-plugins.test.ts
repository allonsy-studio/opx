import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Detector, DetectorContext } from "@allons-y/opx";

/** The `opx/` folder that holds every package. */
const PACKAGES = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

/** Every ESLint-based lint plugin in the monorepo. */
const PLUGINS = readdirSync(PACKAGES).filter((name) => name.startsWith("lint-"));

const manifest = (name: string): { dependencies: Record<string, string> } =>
	JSON.parse(readFileSync(join(PACKAGES, name, "package.json"), "utf8"));

describe("lint plugin manifests", () => {
	it("finds the lint plugins", () => {
		expect(PLUGINS.length).toBeGreaterThan(0);
	});

	describe.each(PLUGINS)("%s", (name) => {
		it("only claims to bundle packages it really depends on", async () => {
			const entry = join(PACKAGES, name, "src", "index.ts");
			const detector = (await import(entry) as { default: Detector }).default;
			const ctx = { cwd: PACKAGES, config: { version: 1, lint: {} } } as unknown as DetectorContext;
			const deps = Object.keys(manifest(name).dependencies);
			for (const dep of detector.describe(ctx).bundledDeps) expect(deps).toContain(dep);
		});

		it("pins the tools it ships to exact versions, so its advice names the version users get", () => {
			for (const [dep, version] of Object.entries(manifest(name).dependencies)) {
				if (!dep.startsWith("@allons-y/")) expect({ dep, version }).toEqual({ dep, version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
			}
		});
	});
});
