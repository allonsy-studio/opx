import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";

import run from "./runner.js";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const BUNDLED_CONFIG = resolve(HERE, "..", "eslint.config.js");

function makeDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-lint-md-"));
	mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
	return dir;
}

type Ctx = DetectorContext & { _output: () => string };

function makeCtx(dir: string, opts: { fix?: boolean; md?: string } = {}): Ctx {
	let output = "";
	const config = { version: 1, lint: {} as Record<string, unknown> };
	if (opts.md) config.lint.md = opts.md;
	return {
		cwd: dir,
		config,
		fix: opts.fix ?? false,
		write: (c: string) => { output += c; },
		fileTypes: new Set(),
		_output: () => output,
	} as unknown as Ctx;
}

describe("lint-md runner", () => {
	it("returns 0 for a clean markdown file", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.md"), "# Title\n\nText.\n");
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["clean.md"])).toBe(0);
	});

	it("returns 1 and writes output for an empty-link violation", async () => {
		const dir = makeDir();
		// markdown/no-empty-links (in recommended) fires on a link with no target.
		writeFileSync(join(dir, "bad.md"), "# Title\n\nSee [x]() here.\n");
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["bad.md"])).toBe(1);
		expect(ctx._output()).toMatch(/error/i);
	});

	it("auto-fixes a fixable file when ctx.fix is true", async () => {
		const dir = makeDir();
		const file = join(dir, "fixme.md");
		// markdown/no-missing-atx-heading-space is fixable: "#Title" -> "# Title".
		writeFileSync(file, "#Title\n\nText.\n");
		const ctx = makeCtx(dir, { fix: true });
		expect(await run(ctx, ["fixme.md"])).toBe(0);
		expect(readFileSync(file, "utf8")).toBe("# Title\n\nText.\n");
	});

	it("no-ops (returns 0) when forwarded paths are all non-owned extensions", async () => {
		const dir = makeDir();
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["x.ts"])).toBe(0);
		expect(ctx._output()).toBe("");
	});

	it("honors an absolute config override", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.md"), "# Title\n\nText.\n");
		const ctx = makeCtx(dir, { md: BUNDLED_CONFIG });
		expect(await run(ctx, ["clean.md"])).toBe(0);
	});

	it("loads the gitignore base config when a .gitignore exists", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, ".gitignore"), "ignored.md\n");
		writeFileSync(join(dir, "clean.md"), "# Title\n\nText.\n");
		const ctx = makeCtx(dir);
		expect(await run(ctx, ["clean.md"])).toBe(0);
	});

	it("defaults to the md/mdx globs when given no args", async () => {
		const dir = makeDir();
		writeFileSync(join(dir, "clean.md"), "# Title\n\nText.\n");
		const ctx = makeCtx(dir);
		expect(await run(ctx, [])).toBe(0);
	});
});
