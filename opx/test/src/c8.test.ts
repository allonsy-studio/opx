import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

import { exec, readTotals, resolveC8 } from "./c8.js";

const scratch = useScratch();

describe("resolveC8", () => {
	it("falls back to the c8 this plugin bundles", () => {
		expect(resolveC8(scratch.dir())).toMatch(/c8[\\/]bin[\\/]c8\.js$/);
	});

	it("prefers the host project's c8", () => {
		const host = scratch.dir();
		const pkg = join(host, "node_modules", "c8");
		mkdirSync(pkg, { recursive: true });
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "c8", version: "0.0.0", bin: { c8: "cli.js" } }));

		expect(resolveC8(host)).toBe(join(realpathSync(pkg), "cli.js"));
	});

	it("fails when a copy declares no c8 executable", () => {
		const host = scratch.dir();
		const pkg = join(host, "node_modules", "c8");
		mkdirSync(pkg, { recursive: true });
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "c8", version: "0.0.0" }));

		expect(() => resolveC8(host)).toThrow(/no c8 executable/);
	});

	it("accepts a bin given as a string", () => {
		const host = scratch.dir();
		const pkg = join(host, "node_modules", "c8");
		mkdirSync(pkg, { recursive: true });
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "c8", version: "0.0.0", bin: "run.js" }));

		expect(resolveC8(host)).toBe(join(realpathSync(pkg), "run.js"));
	});
});

describe("readTotals", () => {
	it("reads the overall percentage of each metric", () => {
		const file = join(scratch.dir(), "coverage-summary.json");
		const pct = (n: number) => ({ total: 10, covered: 1, skipped: 0, pct: n });
		writeFileSync(file, JSON.stringify({ total: { lines: pct(98.1), statements: pct(97), functions: pct(90), branches: pct(94.5) } }));

		expect(readTotals(file)).toEqual({ lines: 98.1, statements: 97, functions: 90, branches: 94.5 });
	});

	it("counts a metric with nothing to measure as fully covered", () => {
		const file = join(scratch.dir(), "coverage-summary.json");
		writeFileSync(file, JSON.stringify({ total: { lines: { pct: 50 }, branches: { pct: "Unknown" } } }));

		expect(readTotals(file)).toEqual({ lines: 50, statements: 100, functions: 100, branches: 100 });
	});

	it("returns nothing when the report is missing or isn't JSON", () => {
		const dir = scratch.dir();
		writeFileSync(join(dir, "bad.json"), "not json");

		expect(readTotals(join(dir, "missing.json"))).toBeUndefined();
		expect(readTotals(join(dir, "bad.json"))).toBeUndefined();
	});
});

describe("exec", () => {
	it("streams stdout and stderr and resolves to the exit code", async () => {
		const chunks: string[] = [];

		const code = await exec(process.execPath, ["-e", 'process.stdout.write("out;"); process.stderr.write("err;"); process.exitCode = 3'], process.cwd(), (c) => chunks.push(c));

		expect(code).toBe(3);
		expect(chunks.join("").split(";").sort()).toEqual(["", "err", "out"]);
	});

	it("reports a signal as exit code 1", async () => {
		expect(await exec(process.execPath, ["-e", 'process.kill(process.pid, "SIGKILL")'], process.cwd(), () => {})).toBe(1);
	});

	it("rejects when the program can't start", async () => {
		await expect(exec(join(scratch.dir(), "missing"), [], process.cwd(), () => {})).rejects.toThrow();
	});
});
