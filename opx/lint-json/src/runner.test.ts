import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import run, { defaultPaths } from "./runner.js";
import { useScratch } from "shared/testing.js";

const scratch = useScratch();

function makeDir(): string {
	const dir = scratch.dir("opx-lint-json-");
	mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
	return dir;
}

type Ctx = DetectorContext & { _output: () => string };

function makeCtx(dir: string, json?: unknown): Ctx {
	let output = "";
	const config = { version: 1, lint: {} as Record<string, unknown> };
	if (json !== undefined) config.lint.json = json;
	return {
		cwd: dir,
		config,
		fix: false,
		write: (c: string) => { output += c; },
		fileTypes: new Set(),
		_output: () => output,
	} as unknown as Ctx;
}

describe("lint-json runner", () => {
	/** Smoke test: the bundled config loads and fails a broken file. */
	it("passes a clean file and fails a broken one with the bundled config", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.json"), '{\n\t"a": 1\n}\n');
		writeFileSync(join(dir, "bad.json"), '{ "a": 1, "a": 2 }');
		expect(await run(makeCtx(dir), ["clean.json"])).toBe(0);
		expect(await run(makeCtx(dir), ["bad.json"])).toBe(1);
	});

	it("no-ops (returns 0) when forwarded paths are all non-owned extensions", async () => {
		const dir = makeDir();
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["x.ts"])).toBe(0);
		expect(ctx._output()).toBe("");
	});

	it("ignores lockfiles by default", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "package-lock.json"), '{"": 1, "a": 1,}');
		expect(await run(makeCtx(dir), [])).toBe(0);
	});
});

describe("defaultPaths", () => {
	const paths = (json?: unknown): string[] => defaultPaths(makeCtx("/repo", json));

	it("lints plain .json when no dialect is chosen", () => {
		expect(paths()).toEqual(["**/*.json"]);
		expect(paths(null)).toEqual(["**/*.json"]);
		expect(paths(true)).toEqual(["**/*.json"]);
		expect(paths("config/eslint.js")).toEqual(["**/*.json"]);
		expect(paths({ dialects: [] })).toEqual(["**/*.json"]);
	});

	it("adds a glob for each chosen dialect", () => {
		expect(paths({ dialects: ["jsonc"] })).toEqual(["**/*.json", "**/*.jsonc"]);
		expect(paths({ dialects: ["json5"] })).toEqual(["**/*.json", "**/*.json5"]);
		expect(paths({ dialects: ["json5", "jsonc"] })).toEqual(["**/*.json", "**/*.jsonc", "**/*.json5"]);
	});

	it("ignores dialects it does not know", () => {
		expect(paths({ dialects: ["yaml"] })).toEqual(["**/*.json"]);
	});
});

describe("default paths and .gitignore", () => {
	it("lints the default paths when none are given", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "bad.json"), '{ "a": 1, "a": 2 }');
		expect(await run(makeCtx(dir), [])).toBe(1);
	});

	it("skips files the project's .gitignore lists", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "bad.json"), '{ "a": 1, "a": 2 }');
		writeFileSync(join(dir, ".gitignore"), "bad.json\n");
		expect(await run(makeCtx(dir), [])).toBe(0);
	});
});
