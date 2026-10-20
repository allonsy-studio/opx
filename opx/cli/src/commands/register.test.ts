import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";

import registerDisable from "./disable.js";
import registerEnable from "./enable.js";
import registerInit from "./init.js";
import registerScan from "./scan.js";

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
		dir = mkdtempSync(join(tmpdir(), "opx-reg-"));
		const opts = { cwd: dir, stdio: "ignore" as const };
		execFileSync("git", ["init", "-b", "main"], opts);
		execFileSync("git", ["config", "user.email", "t@t.io"], opts);
		execFileSync("git", ["config", "user.name", "t"], opts);
		writeFileSync(join(dir, "a.md"), "# x\n");
		execFileSync("git", ["add", "."], opts);
		execFileSync("git", ["commit", "-m", "init"], opts);
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
		rmSync(dir, { recursive: true, force: true });
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

	it("init shows what the lint-js plugin suggests dropping, and --no-cleanup leaves it out", async () => {
		mkdirSync(join(dir, ".opx"));
		writeFileSync(join(dir, ".opx/config.json"), JSON.stringify({ version: 1, lint: { js: true } }));
		writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@allons-y/opx-lint-js": "^1.0.0", eslint: "^9.0.0" } }));
		writeFileSync(join(dir, ".eslintrc.json"), "{}\n");
		writeFileSync(join(dir, ".eslintignore"), "coverage\n");
		writeFileSync(join(dir, ".eslintrc.yml"), "rules:\n  semi: error\n");
		execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "deps"], { cwd: dir, stdio: "ignore" });

		await run(registerInit, "init");
		expect(printed()).toContain("Empty files that git can restore:\n  - .eslintrc.json");
		expect(printed()).toContain("- .eslintignore: opx lint uses its own config, not this");
		expect(printed()).toContain("Run: npx @eslint/migrate-config .eslintrc.yml");
		expect(printed()).toMatch(/- eslint: bundled by @allons-y\/opx-lint-js at \d+\.\d+\.\d+; nothing else appears to use it/);
		expect(printed()).toContain("Drop the unused packages with: npm uninstall eslint");
		expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);

		log.mockClear();
		await run(registerInit, "init", "--no-cleanup");
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
