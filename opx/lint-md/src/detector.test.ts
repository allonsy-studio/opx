import { tmpdir } from "node:os";

import type { Detector, DetectorContext } from "@allons-y/opx";

import detector from "./detector.js";
import { useScratch } from "shared/testing.js";

const scratch = useScratch();

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

	it("describes its summary and bundled deps", () => {
		const desc = d.describe(ctx(new Set()));
		expect(desc.summary).toContain("ESLint");
		expect(desc.bundledDeps).toContain("eslint");
		expect(desc.bundledDeps.length).toBeGreaterThan(0);
	});

	it("delegates run() to the runner against a clean file", async () => {
		const { mkdirSync, writeFileSync } = await import("node:fs");
		const { join } = await import("node:path");
		const dir = scratch.dir("opx-lint-");
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

describe("@allons-y/opx-lint-md cleanup", () => {
	const ctx = { cwd: tmpdir(), config: { version: 1, lint: {} } } as unknown as DetectorContext;
	const bundled = detector.describe(ctx).bundledDeps;

	it("suggests what it bundles and the legacy ESLint config", () => {
		const suggestions = detector.cleanup!(ctx);
		expect(suggestions.filter((s) => s.kind === "dependency").map((s) => s.target)).toEqual(bundled);
		expect(suggestions.map((s) => s.target)).toEqual(expect.arrayContaining([".eslintrc.json", ".eslintignore", "eslintConfig"]));
	});

	it("says which version of each package it ships", () => {
		for (const s of detector.cleanup!(ctx).filter((s) => s.kind === "dependency")) expect(s.reason).toMatch(/ at \d+\.\d+\.\d+/);
	});

	it("only claims packages it really depends on", async () => {
		const { readFileSync } = await import("node:fs");
		const { fileURLToPath } = await import("node:url");
		const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { dependencies: Record<string, string> };
		for (const name of bundled) expect(Object.keys(pkg.dependencies)).toContain(name);
	});

	it("pins the tools it ships to exact versions, so its advice names the version users get", async () => {
		const { readFileSync } = await import("node:fs");
		const { fileURLToPath } = await import("node:url");
		const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { dependencies: Record<string, string> };
		for (const [name, version] of Object.entries(pkg.dependencies)) {
			if (!name.startsWith("@allons-y/")) expect({ name, version }).toEqual({ name, version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
		}
	});
});
