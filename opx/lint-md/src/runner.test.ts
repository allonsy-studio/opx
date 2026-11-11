import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import run from "./runner.js";
import { useScratch } from "shared/testing.js";

const scratch = useScratch();

function makeDir(): string {
	const dir = scratch.dir("opx-lint-md-");
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

/** A bracketed commit hash, which ordinary Markdown reports as a missing label reference. */
const CHANGELOG_BODY = "# Changelog\n\n- Updated dependencies [e30e06d]\n";

describe("lint-md runner", () => {
	/** Smoke test: the bundled config loads, passes a clean file, and fails a broken one. */
	it("passes a clean file and fails a broken one with the bundled config", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.md"), "# Title\n\nText.\n");
		writeFileSync(join(dir, "notes.md"), CHANGELOG_BODY);
		expect(await run(makeCtx(dir), ["clean.md"])).toBe(0);
		expect(await run(makeCtx(dir), ["notes.md"])).toBe(1);
	});

	it("ignores generated changelogs", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG_BODY);
		expect(await run(makeCtx(dir), ["CHANGELOG.md"])).toBe(0);
	});

	it("no-ops (returns 0) when forwarded paths are all non-owned extensions", async () => {
		const dir = makeDir();
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["x.ts"])).toBe(0);
		expect(ctx._output()).toBe("");
	});
});

describe("default paths and .gitignore", () => {
	it("lints the default paths when none are given", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "notes.md"), CHANGELOG_BODY);
		expect(await run(makeCtx(dir), [])).toBe(1);
	});

	it("skips files the project's .gitignore lists", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "notes.md"), CHANGELOG_BODY);
		writeFileSync(join(dir, ".gitignore"), "notes.md\n");
		expect(await run(makeCtx(dir), [])).toBe(0);
	});
});
