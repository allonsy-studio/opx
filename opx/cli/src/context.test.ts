import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildContext, readHostPackage } from "./context.js";

function gitRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-ctx-"));
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["init", "-b", "main"], opts);
	execFileSync("git", ["config", "user.email", "t@t.io"], opts);
	execFileSync("git", ["config", "user.name", "t"], opts);
	return dir;
}

describe("readHostPackage", () => {
	it("returns {} when no package.json exists", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-ctx-"));
		expect(readHostPackage(dir)).toEqual({});
		rmSync(dir, { recursive: true });
	});

	it("parses an existing package.json", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-ctx-"));
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo", dependencies: { a: "1" } }), "utf8");
		const pkg = readHostPackage(dir);
		expect(pkg.name).toBe("demo");
		expect(pkg.dependencies?.a).toBe("1");
		rmSync(dir, { recursive: true });
	});
});

describe("buildContext", () => {
	it("assembles a DetectorContext from a repo", () => {
		const dir = gitRepo();
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
		writeFileSync(join(dir, "a.ts"), "x", "utf8");
		execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });

		const ctx = buildContext({ cwd: dir });
		expect(ctx.cwd).toBe(dir);
		expect(ctx.fileTypes.has(".ts")).toBe(true);
		expect(ctx.hostPkg.name).toBe("demo");
		expect(ctx.config).toMatchObject({ version: 1 });
		expect(ctx.state).toMatchObject({ version: 1 });
		expect(ctx.branch).toBe("main");
		expect(typeof ctx.write).toBe("function");
		expect(ctx.dryRun).toBe(false);
		expect(ctx.fix).toBe(false);
		expect(ctx.logger).toBeDefined();
		expect(ctx.pkgManager).toBeDefined();
		rmSync(dir, { recursive: true });
	});

	it("honors debug, dryRun, and fix options", () => {
		const dir = gitRepo();
		const ctx = buildContext({ cwd: dir, debug: true, dryRun: true, fix: true });
		expect(ctx.dryRun).toBe(true);
		expect(ctx.fix).toBe(true);
		rmSync(dir, { recursive: true });
	});

	it("write forwards to process.stdout without throwing", () => {
		const dir = gitRepo();
		const ctx = buildContext({ cwd: dir });
		expect(() => ctx.write("")).not.toThrow();
		rmSync(dir, { recursive: true });
	});
});
