import { jest } from "@jest/globals";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

import { buildContext, readHostPackage } from "./context.js";

const scratch = useScratch();

describe("readHostPackage", () => {
	it("returns {} when no package.json exists", () => {
		expect(readHostPackage(scratch.dir("opx-ctx-"))).toEqual({});
	});

	it("parses an existing package.json", () => {
		const dir = scratch.dir("opx-ctx-");
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo", dependencies: { a: "1" } }), "utf8");
		const pkg = readHostPackage(dir);
		expect(pkg.name).toBe("demo");
		expect(pkg.dependencies?.a).toBe("1");
	});
});

describe("buildContext", () => {
	it("assembles a DetectorContext from a repo", () => {
		const dir = scratch.repo({ "package.json": JSON.stringify({ name: "demo" }), "a.ts": "x" });

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
	});

	it("honors debug, dryRun, and fix options", () => {
		const ctx = buildContext({ cwd: scratch.repo(), debug: true, dryRun: true, fix: true });
		expect(ctx.dryRun).toBe(true);
		expect(ctx.fix).toBe(true);
	});

	it("write forwards to process.stdout without throwing", () => {
		const ctx = buildContext({ cwd: scratch.repo() });
		expect(() => ctx.write("")).not.toThrow();
	});

	it("reads fileTypes and branch from git only when asked, then reuses them", () => {
		const ctx = buildContext({ cwd: scratch.repo({ "a.ts": "x" }) });
		expect(typeof Object.getOwnPropertyDescriptor(ctx, "fileTypes")?.get).toBe("function");
		expect(typeof Object.getOwnPropertyDescriptor(ctx, "branch")?.get).toBe("function");
		expect(ctx.fileTypes).toBe(ctx.fileTypes);
		expect(ctx.branch).toBe("main");
	});

	it("uses the logger it is given", () => {
		const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
		expect(buildContext({ cwd: scratch.repo(), logger }).logger).toBe(logger);
	});
});
