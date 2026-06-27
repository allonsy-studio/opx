import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";

import { runEslint } from "./runner.js";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const BUNDLED_CONFIG = resolve(HERE, "..", "eslint.config.js");

function makeDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-lint-js-"));
	mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
	return dir;
}

type Ctx = DetectorContext & { _output: () => string };

function makeCtx(dir: string, fix = false, overrideJs?: string): Ctx {
	let output = "";
	const config = { version: 1, lint: {} as Record<string, unknown> };
	if (overrideJs) config.lint.js = overrideJs;
	return {
		cwd: dir,
		config,
		fix,
		write: (c: string) => { output += c; },
		fileTypes: new Set(),
		_output: () => output,
	} as unknown as Ctx;
}

describe("runEslint", () => {
	it("returns 0 for a clean file", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.ts"), "export const ok = 1;\n");
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, ["clean.ts"])).toBe(0);
	});

	it("returns 1 and writes output for a file with violations", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "bad.ts"), "const x = 'a'\n");
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, ["bad.ts"])).toBe(1);
		expect(ctx._output()).toMatch(/error/i);
	});

	it("auto-fixes a fixable file when ctx.fix is true", async () => {
		const dir = makeDir();
		const file = join(dir, "fixme.ts");
		writeFileSync(file, "export const ok = 'a';\n");
		const ctx = makeCtx(dir, true);
		expect(await runEslint(ctx, ["fixme.ts"])).toBe(0);
		expect(readFileSync(file, "utf8")).toBe('export const ok = "a";\n');
	});

	it("no-ops (returns 0) when forwarded paths are all non-owned extensions", async () => {
		const dir = makeDir();
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, ["x.json"])).toBe(0);
		expect(ctx._output()).toBe("");
	});

	it("honors a config override pointing at an absolute config path", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.ts"), "export const ok = 1;\n");
		const ctx = makeCtx(dir, false, BUNDLED_CONFIG);
		expect(await runEslint(ctx, ["clean.ts"])).toBe(0);
	});

	it("loads the gitignore base config when a .gitignore exists", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, ".gitignore"), "ignored.ts\n");
		writeFileSync(join(dir, "clean.ts"), "export const ok = 1;\n");
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, ["clean.ts"])).toBe(0);
	});

	it("defaults to linting the cwd when given no args", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.ts"), "export const ok = 1;\n");
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, [])).toBe(0);
	});
});
