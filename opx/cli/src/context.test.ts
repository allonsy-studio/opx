import { jest } from "@jest/globals";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

/** Spies that run the real scanner, so tests can count git calls. */
const scanner = await import("./scanner.js");
const scanCommittedTree = jest.fn(scanner.scanCommittedTree);
const getCurrentBranch = jest.fn(scanner.getCurrentBranch);
jest.unstable_mockModule("./scanner.js", () => ({ ...scanner, scanCommittedTree, getCurrentBranch }));

const { buildContext, readHostPackage } = await import("./context.js");

const scratch = useScratch();

describe("readHostPackage", () => {
	it("returns {} when no package.json exists", () => {
		expect(readHostPackage(scratch.dir("opx-ctx-"))).toEqual({});
	});

	it("throws on a malformed package.json instead of treating it as empty", () => {
		const dir = scratch.dir("opx-ctx-");
		writeFileSync(join(dir, "package.json"), "{oops", "utf8");
		expect(() => readHostPackage(dir)).toThrow();
	});
});

describe("buildContext", () => {
	it("reads the host package from cwd and derives the package manager from it", () => {
		const dir = scratch.repo({ "package.json": JSON.stringify({ name: "demo", packageManager: "pnpm@9.0.0" }) });
		const ctx = buildContext({ cwd: dir });
		expect(ctx.cwd).toBe(dir);
		expect(ctx.hostPkg.name).toBe("demo");
		expect(ctx.pkgManager).toBe("pnpm");
		expect(ctx.dryRun).toBe(false);
		expect(ctx.fix).toBe(false);
	});

	it("honors debug, dryRun, and fix options", () => {
		const ctx = buildContext({ cwd: scratch.repo(), debug: true, dryRun: true, fix: true });
		expect(ctx.dryRun).toBe(true);
		expect(ctx.fix).toBe(true);
	});

	it("write forwards each chunk to process.stdout", () => {
		const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
		try {
			buildContext({ cwd: scratch.repo() }).write("hello");
			expect(write).toHaveBeenCalledWith("hello");
		} finally {
			write.mockRestore();
		}
	});

	it("calls git for fileTypes and branch only on first read, then reuses the result", () => {
		const ctx = buildContext({ cwd: scratch.repo({ "a.ts": "x" }) });
		expect(scanCommittedTree).not.toHaveBeenCalled();
		expect(getCurrentBranch).not.toHaveBeenCalled();

		expect(ctx.fileTypes).toBe(ctx.fileTypes);
		expect(ctx.fileTypes.has(".ts")).toBe(true);
		expect(scanCommittedTree).toHaveBeenCalledTimes(1);

		expect(ctx.branch).toBe(ctx.branch);
		expect(getCurrentBranch).toHaveBeenCalledTimes(1);
	});

	it("uses the logger it is given", () => {
		const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
		expect(buildContext({ cwd: scratch.repo(), logger }).logger).toBe(logger);
	});
});
