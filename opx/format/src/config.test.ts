import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";
import { useScratch } from "shared/testing.js";

import { runFormat } from "./runner.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
	exports: Record<string, { import: string; types: string }>;
	files: string[];
	dependencies: Record<string, string>;
};

describe("@allons-y/opx-format package", () => {
	it("exports the default config at /prettier and publishes it", () => {
		const target = pkg.exports["./prettier"]!;
		for (const file of [target.import, target.types]) {
			expect(existsSync(join(ROOT, file))).toBe(true);
			expect(pkg.files).toContain(file.replace("./", ""));
		}
	});

	it("pins Prettier to an exact version", () => {
		expect(pkg.dependencies.prettier).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

describe("the shipped Prettier config", () => {
	const scratch = useScratch();

	/** A context for a scratch project. */
	function ctxIn(cwd: string, fix = false): { ctx: DetectorContext; out: string[] } {
		const out: string[] = [];
		const ctx = {
			cwd,
			fix,
			dryRun: false,
			config: { version: 1 },
			write: (chunk: string) => out.push(chunk),
		} as unknown as DetectorContext;
		return { ctx, out };
	}

	it("loads, passes a formatted file, and fails an unformatted one", async () => {
		const cwd = scratch.dir("opx-format-");
		writeFileSync(join(cwd, "ok.ts"), "export const a = 1;\n");
		const clean = ctxIn(cwd);
		expect(await runFormat(clean.ctx, [])).toBe(0);

		writeFileSync(join(cwd, "bad.ts"), "export const a   =   {b:1}\n");
		const dirty = ctxIn(cwd);
		expect(await runFormat(dirty.ctx, [])).toBe(1);
		expect(dirty.out.join("")).toContain("bad.ts");
		expect(dirty.out.join("")).not.toContain("ok.ts");
	});

	it("skips what .gitignore and .prettierignore list", async () => {
		const cwd = scratch.dir("opx-format-");
		for (const file of ["git.ts", "pretty.ts"]) writeFileSync(join(cwd, file), "export const a   =   1\n");
		writeFileSync(join(cwd, ".gitignore"), "git.ts\n");
		writeFileSync(join(cwd, ".prettierignore"), "pretty.ts\n");
		const { ctx, out } = ctxIn(cwd);
		expect(await runFormat(ctx, [])).toBe(0);
		expect(out).toEqual([]);
	});

	it("rewrites files when fixing", async () => {
		const cwd = scratch.dir("opx-format-");
		writeFileSync(join(cwd, "bad.ts"), "export const a   =   1\n");
		const { ctx, out } = ctxIn(cwd, true);
		expect(await runFormat(ctx, [])).toBe(0);
		expect(out.join("")).toContain("bad.ts");
		expect(await runFormat(ctxIn(cwd).ctx, [])).toBe(0);
	});
});
