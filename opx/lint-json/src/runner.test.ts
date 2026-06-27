import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";

import run from "./runner.js";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const BUNDLED_CONFIG = resolve(HERE, "..", "eslint.config.js");

function makeDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-lint-json-"));
	mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
	return dir;
}

type Ctx = DetectorContext & { _output: () => string };

function makeCtx(dir: string, opts: { fix?: boolean; json?: unknown } = {}): Ctx {
	let output = "";
	const config = { version: 1, lint: {} as Record<string, unknown> };
	if (opts.json !== undefined) config.lint.json = opts.json;
	return {
		cwd: dir,
		config,
		fix: opts.fix ?? false,
		write: (c: string) => { output += c; },
		fileTypes: new Set(),
		_output: () => output,
	} as unknown as Ctx;
}

describe("lint-json runner", () => {
	it("returns 0 for a clean json file", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.json"), '{\n\t"a": 1\n}\n');
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["clean.json"])).toBe(0);
	});

	it("returns 1 and writes output for a duplicate-key violation", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "bad.json"), '{ "a": 1, "a": 2 }');
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["bad.json"])).toBe(1);
		expect(ctx._output()).toMatch(/error/i);
	});

	it("auto-fixes a fixable file when ctx.fix is true", async () => {
		const dir = makeDir();
		const file = join(dir, "fixme.json");
		// A decomposed-unicode key (e + combining acute U+0301) trips the
		// fixable json/no-unnormalized-keys rule; --fix rewrites it to NFC
		// (composed U+00E9). Built from char codes to keep this source ASCII.
		const decomposedKey = `e${String.fromCharCode(0x0301)}`;
		const composedKey = String.fromCharCode(0x00e9);
		const decomposed = `{\n\t"${decomposedKey}": 1\n}\n`;
		const composed = `{\n\t"${composedKey}": 1\n}\n`;
		writeFileSync(file, decomposed);
		const ctx = makeCtx(dir, { fix: true });
		expect(await run(ctx, ["fixme.json"])).toBe(0);
		expect(readFileSync(file, "utf8")).toBe(composed);
	});

	it("no-ops (returns 0) when forwarded paths are all non-owned extensions", async () => {
		const dir = makeDir();
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["x.ts"])).toBe(0);
		expect(ctx._output()).toBe("");
	});

	it("honors an absolute config override", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.json"), '{\n\t"a": 1\n}\n');
		const ctx = makeCtx(dir, { json: BUNDLED_CONFIG });
		expect(await run(ctx, ["clean.json"])).toBe(0);
	});

	it("loads the gitignore base config when a .gitignore exists", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, ".gitignore"), "ignored.json\n");
		writeFileSync(join(dir, "clean.json"), '{\n\t"a": 1\n}\n');
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["clean.json"])).toBe(0);
	});

	it("expands default paths for opted-in jsonc/json5 dialects", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.json"), '{\n\t"a": 1\n}\n');
		const ctx = makeCtx(dir, { json: { dialects: ["jsonc", "json5"] } });
		// No args -> defaultPaths(ctx) runs the jsonc/json5 branches.
		expect(await run(ctx, [])).toBe(0);
	});
});
