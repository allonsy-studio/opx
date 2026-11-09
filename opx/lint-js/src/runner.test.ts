import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import { runEslint } from "./runner.js";
import { useScratch } from "shared/testing.js";

const scratch = useScratch();

function makeDir(): string {
	const dir = scratch.dir("opx-lint-js-");
	mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
	return dir;
}

type Ctx = DetectorContext & { _output: () => string };

function makeCtx(dir: string): Ctx {
	let output = "";
	return {
		cwd: dir,
		config: { version: 1, lint: {} },
		fix: false,
		write: (c: string) => { output += c; },
		fileTypes: new Set(),
		_output: () => output,
	} as unknown as Ctx;
}

describe("runEslint", () => {
	/** Smoke test: the bundled config loads, passes a clean file, and fails a broken one. */
	it("passes a clean file and fails a broken one with the bundled config", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.js"), "export const ok = 1;\n");
		writeFileSync(join(dir, "bad.js"), "const x = 'a'\n");
		expect(await runEslint(makeCtx(dir), ["clean.js"])).toBe(0);
		expect(await runEslint(makeCtx(dir), ["bad.js"])).toBe(1);
	});

	it("no-ops (returns 0) when forwarded paths are all non-owned extensions", async () => {
		const dir = makeDir();
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, ["x.json"])).toBe(0);
		expect(ctx._output()).toBe("");
	});
});

describe("default paths and .gitignore", () => {
	it("lints the default paths when none are given", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "bad.js"), "const x = 'a'\n");
		expect(await runEslint(makeCtx(dir), [])).toBe(1);
	});

	it("skips files the project's .gitignore lists", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "bad.js"), "const x = 'a'\n");
		writeFileSync(join(dir, ".gitignore"), "bad.js\n");
		expect(await runEslint(makeCtx(dir), [])).toBe(0);
	});
});
