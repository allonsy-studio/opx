import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { useScratch } from "shared/testing.js";

import registerDisable from "./disable.js";
import registerEnable from "./enable.js";
import registerInit from "./init.js";
import registerScan from "./scan.js";

/**
 * Stands in for the built @allons-y/opx-lint-js, so these tests need no build.
 * The real plugin's suggestions are tested in its own package and by `yarn smoke`.
 */
const fakePlugin = {
	id: "@allons-y/opx-lint-js",
	shortName: "js",
	concern: "lint",
	displayName: "fake",
	detect: () => true,
	describe: () => ({ summary: "", bundledDeps: ["eslint"] }),
	cleanup: () => [
		{ kind: "file", target: ".eslintrc.json", reason: "not applied" },
		{ kind: "file", target: ".eslintignore", reason: "not applied", hint: "move the patterns" },
		{ kind: "dependency", target: "eslint", reason: "bundled by @allons-y/opx-lint-js" },
	],
};
jest.unstable_mockModule("@allons-y/opx-lint-js", () => ({ default: fakePlugin }), { virtual: true });

const scratch = useScratch();

/** Run a registered command the way the CLI binary does. */
async function run(register: (p: Command) => void, ...argv: string[]): Promise<void> {
	const program = new Command().exitOverride();
	register(program);
	await program.parseAsync(["node", "opx", ...argv]);
}

describe("command registration", () => {
	const originalCwd = process.cwd();
	const saved = { ci: process.env.CI, ni: process.env.OPX_NONINTERACTIVE, code: process.exitCode };
	let dir: string;
	let log: ReturnType<typeof jest.spyOn>;

	const printed = (): string => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

	beforeEach(() => {
		dir = scratch.repo({ "a.md": "# x\n" });
		process.chdir(dir);
		process.env.OPX_NONINTERACTIVE = "1";
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		process.chdir(originalCwd);
		jest.restoreAllMocks();
		if (saved.ci === undefined) delete process.env.CI; else process.env.CI = saved.ci;
		if (saved.ni === undefined) delete process.env.OPX_NONINTERACTIVE; else process.env.OPX_NONINTERACTIVE = saved.ni;
		process.exitCode = saved.code;
	});

	it("enable and disable toggle a task and set the exit code", async () => {
		await run(registerEnable, "enable", "release");
		expect(process.exitCode).toBe(0);
		const config = (): { release: boolean } => JSON.parse(readFileSync(join(dir, ".opx/config.json"), "utf8")) as { release: boolean };
		expect(config().release).toBe(true);

		await run(registerDisable, "disable", "release");
		expect(config().release).toBe(false);

		await run(registerEnable, "enable", "nope");
		expect(process.exitCode).toBe(1);
	});

	it("scan exits with the scan result", async () => {
		const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
		await run(registerScan, "scan", "--json");
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("init prints a report in a non-interactive shell", async () => {
		await run(registerInit, "init");
		expect(existsSync(join(dir, ".opx/config.json"))).toBe(true);
		expect(printed()).toContain("wrote starter");
	});

	it("init shows what an enabled plugin suggests dropping only with --cleanup", async () => {
		mkdirSync(join(dir, ".opx"));
		writeFileSync(join(dir, ".opx/config.json"), JSON.stringify({ version: 1, lint: { js: true } }));
		writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@allons-y/opx-lint-js": "^1.0.0", eslint: "^9.0.0" } }));
		writeFileSync(join(dir, ".eslintrc.json"), "{}\n");
		writeFileSync(join(dir, ".eslintignore"), "coverage\n");
		execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "deps"], { cwd: dir, stdio: "ignore" });

		await run(registerInit, "init", "--cleanup");
		expect(printed()).toContain("Empty files that git can restore:\n  - .eslintrc.json");
		expect(printed()).toContain("- .eslintignore: not applied\n      move the patterns");
		expect(printed()).toContain("- eslint: bundled by @allons-y/opx-lint-js; nothing else appears to use it");
		expect(printed()).toContain("Drop the unused packages with: npm uninstall eslint");
		expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);

		log.mockClear();
		await run(registerInit, "init");
		expect(printed()).not.toContain("bundled by");
	});

	it("init --auto only hints outside a TTY, and stays quiet with --quiet", async () => {
		await run(registerInit, "init", "--auto");
		expect(printed()).toContain("run `opx init`");
		expect(existsSync(join(dir, ".opx/config.json"))).toBe(false);

		log.mockClear();
		await run(registerInit, "init", "--auto", "--quiet");
		expect(printed()).toBe("");
	});
});
