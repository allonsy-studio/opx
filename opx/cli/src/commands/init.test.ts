import { jest } from "@jest/globals";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CleanupSuggestion, Detector } from "@allons-y/opx";
import { inspectPackageManager, installCommand } from "@allons-y/opx";
import { Command } from "commander";
import { useScratch } from "shared/testing.js";

/** The part of a prompt these tests read. */
type Prompt = { message: string; options?: Array<{ value: unknown }> };

const CANCEL = Symbol("cancel");
const select = jest.fn<(o: Prompt) => Promise<unknown>>();
const confirm = jest.fn<(o: Prompt) => Promise<unknown>>();
const cancel = jest.fn();
const logInfo = jest.fn();
const logWarn = jest.fn();
const logSuccess = jest.fn();
const detectMode = jest.fn<() => string>();
const loadDetectors = jest.fn<(ctx: unknown) => Promise<Detector[]>>();

jest.unstable_mockModule("@clack/prompts", () => ({
	intro: jest.fn(),
	outro: jest.fn(),
	cancel,
	select,
	confirm,
	isCancel: (v: unknown) => v === CANCEL,
	log: { info: logInfo, success: logSuccess, warn: logWarn, error: jest.fn() },
}));

jest.unstable_mockModule("../tty.js", () => ({ detectMode }));

/** Runs the real child_process unless a test overrides it; lets runInstall be checked without spawning. */
const childProcess = await import("node:child_process");
const execFileSync = jest.fn<(...args: unknown[]) => unknown>();
jest.unstable_mockModule("node:child_process", () => ({ ...childProcess, execFileSync }));

const builtIn = await import("../built-in.js");
jest.unstable_mockModule("../built-in.js", () => ({ ...builtIn, load: loadDetectors }));

const { default: register, runAccept, runInstall, runInteractive, runReport } = await import("./init.js");

const scratch = useScratch();

const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");
type Parsed = {
	lint?: Record<string, unknown>;
	scripts?: Record<string, string>;
	deferrals: Record<string, { branch: string; reason: string; skipUntilDate: string }>;
};
const json = (dir: string, file: string): Parsed => JSON.parse(read(dir, file)) as Parsed;
const PKG = JSON.stringify({ name: "host", version: "1.0.0" });

describe("init", () => {
	const install = jest.fn<(cmd: string, cwd: string) => void>();
	const originalCwd = process.cwd();
	let log: ReturnType<typeof jest.spyOn>;

	const make = (files: Record<string, string>): string => scratch.repo(files);
	const printed = (): string => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
	/** Answer each select by the short name in its message. */
	const answers = (map: Record<string, unknown>, fallback: unknown = "no"): void => {
		select.mockImplementation(async ({ message }) => {
			const hit = Object.keys(map).find((k) => message.startsWith(`Enable ${k} `));
			return hit ? map[hit] : fallback;
		});
	};

	beforeEach(() => {
		jest.clearAllMocks();
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		confirm.mockResolvedValue(true);
		detectMode.mockReturnValue("interactive");
		loadDetectors.mockResolvedValue([]);
		execFileSync.mockImplementation(childProcess.execFileSync as never);
	});
	afterEach(() => {
		process.chdir(originalCwd);
		jest.restoreAllMocks();
	});

	describe("runInteractive", () => {
		it("enables accepted plugins, installs the hook, and ignores local files", async () => {
			const dir = make({ "a.js": "x", "b.md": "x", "package.json": PKG });
			answers({}, "yes");
			await runInteractive(dir, install);

			const cfg = json(dir, ".opx/config.json");
			expect(cfg.lint?.js).toBe(true);
			expect(cfg.lint?.md).toBe(true);
			expect(cfg.lint?.json).toBe(true);
			expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining("Installed git hook"));
			expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining("Updated .gitignore"));
		});

		it("keeps release settings already in the config", async () => {
			const settings = { githubReleases: false };
			const dir = make({ "a.js": "x", "package.json": PKG, ".opx/config.json": JSON.stringify({ version: 1, release: settings }) });
			answers({}, "yes");
			await runInteractive(dir, install);
			expect((json(dir, ".opx/config.json") as Parsed & { release?: unknown }).release).toEqual(settings);
		});

		it("records a one-branch deferral for 'later' and leaves the plugin off", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({ js: "later" });
			await runInteractive(dir, install);

			expect(json(dir, ".opx/config.json").lint?.js).toBeUndefined();
			const entry = json(dir, ".opx/state.json").deferrals.js;
			expect(entry?.branch).toBe("main");
			expect(entry?.reason).toBe("later");
			expect(entry?.skipUntilDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});

		it("records nothing for 'no'", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({}, "no");
			await runInteractive(dir, install);

			expect(json(dir, ".opx/config.json").lint?.js).toBeUndefined();
			expect(json(dir, ".opx/state.json").deferrals).toEqual({});
			expect(confirm).not.toHaveBeenCalled();
		});

		it("stops without writing tooling when a prompt is cancelled", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({}, CANCEL);
			await runInteractive(dir, install);

			expect(cancel).toHaveBeenCalled();
			expect(existsSync(join(dir, "eslint.config.js"))).toBe(false);
			expect(existsSync(join(dir, ".gitignore"))).toBe(false);
			expect(install).not.toHaveBeenCalled();
		});

		it("runs the install command when confirmed and skips it when declined", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({ js: "yes" });
			await runInteractive(dir, install);
			expect(install).toHaveBeenCalledTimes(1);
			expect(install.mock.calls[0]?.[0]).toContain("@allons-y/opx-lint-js");
			expect(install.mock.calls[0]?.[1]).toBe(dir);

			install.mockClear();
			const other = make({ "a.js": "x", "package.json": PKG });
			confirm.mockResolvedValue(false);
			await runInteractive(other, install);
			expect(install).not.toHaveBeenCalled();
			expect(json(other, ".opx/config.json").lint?.js).toBe(true);
		});

		it("installs with the command the engine builds for the project's package manager", async () => {
			answers({ js: "yes" });
			const dir = make({ "a.js": "x", "package.json": PKG, "pnpm-lock.yaml": "", "pnpm-workspace.yaml": "" });
			const pm = inspectPackageManager(dir, JSON.parse(PKG));
			await runInteractive(dir, install);
			expect(install).toHaveBeenLastCalledWith(installCommand(pm.name, ["@allons-y/opx-lint-js"], pm), dir);
		});

		it("shows the command instead of running it when the project points at several package managers", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG, "yarn.lock": "", "package-lock.json": "{}" });
			answers({ js: "yes" });
			await runInteractive(dir, install);

			expect(install).not.toHaveBeenCalled();
			expect(confirm.mock.calls.some(([o]) => o.message.startsWith("Install"))).toBe(false);
			const warned = logWarn.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
			expect(warned).toContain("@allons-y/opx-lint-js");
			expect(json(dir, ".opx/config.json").lint?.js).toBe(true);
		});

		it("adds a lint script only when none exists and the user agrees", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({ js: "yes" });
			await runInteractive(dir, install);
			expect(json(dir, "package.json").scripts?.lint).toBe("opx lint");

			const kept = make({ "a.js": "x", "package.json": JSON.stringify({ name: "h", scripts: { lint: "eslint ." } }) });
			await runInteractive(kept, install);
			expect(json(kept, "package.json").scripts?.lint).toBe("eslint .");

			const declined = make({ "a.js": "x", "package.json": PKG });
			confirm.mockImplementation(async ({ message }) => !message.includes("package.json"));
			await runInteractive(declined, install);
			expect(json(declined, "package.json").scripts).toBeUndefined();
		});

		it("never overwrites an existing eslint.config.js", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG, "eslint.config.js": "// mine\n" });
			answers({ js: "yes" });
			await runInteractive(dir, install);
			expect(read(dir, "eslint.config.js")).toBe("// mine\n");
		});

		it("points an accepted plugin at the local config the others share", async () => {
			const config = JSON.stringify({ version: 1, lint: { js: "./eslint.config.js", md: "./eslint.config.js" } });
			const dir = make({ "a.ts": "x", "package.json": PKG, ".opx/config.json": config });
			answers({ ts: "yes" });
			await runInteractive(dir, install);
			expect(json(dir, ".opx/config.json").lint?.ts).toBe("./eslint.config.js");
		});

		it("installs a JavaScript-only lint-js beside lint-ts", async () => {
			const dir = make({ "a.js": "x", "b.ts": "x", "package.json": PKG });
			answers({ js: "yes", ts: "yes" });
			await runInteractive(dir, install);
			const cmd = String(install.mock.calls.at(-1)?.[0]);
			expect(cmd).toContain("@allons-y/opx-lint-js@^1.0.0-beta.1");
			expect(cmd).toContain("@allons-y/opx-lint-ts");
			expect(cmd).not.toMatch(/opx-lint-js(\s|$)/);
		});

		it("upgrades an installed lint-js 0.x when lint-ts is accepted", async () => {
			const pkg = JSON.stringify({ name: "host", devDependencies: { "@allons-y/opx-lint-js": "^0.1.0-beta.0" } });
			const dir = make({ "a.ts": "x", "package.json": pkg, ".opx/config.json": JSON.stringify({ version: 1, lint: { js: true } }) });
			answers({ ts: "yes" });
			await runInteractive(dir, install);
			expect(String(install.mock.calls.at(-1)?.[0])).toContain("@allons-y/opx-lint-js@^1.0.0-beta.1");
			expect(logInfo.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain("0.x release");
		});

		it("leaves lint-js alone when the project does not use it", async () => {
			const dir = make({ "a.ts": "x", "package.json": PKG });
			answers({ ts: "yes" });
			await runInteractive(dir, install);
			const cmd = String(install.mock.calls.at(-1)?.[0]);
			expect(cmd).toContain("@allons-y/opx-lint-ts");
			expect(cmd).not.toContain("opx-lint-js");
		});

		it("prints the lines an existing eslint.config.js lacks", async () => {
			const eslint = 'import js from "@allons-y/opx-lint-js/eslint.config.js";\nexport default [...js];\n';
			const dir = make({ "a.ts": "x", "package.json": PKG, "eslint.config.js": eslint });
			answers({ ts: "yes" });
			await runInteractive(dir, install);
			const info = logInfo.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
			expect(info).toContain('import ts from "@allons-y/opx-lint-ts/eslint.config.js";');
			expect(info).toContain("...ts,");
			expect(read(dir, "eslint.config.js")).toBe(eslint);
		});

		it("keeps existing config choices and does not re-ask for them", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({ js: "yes" });
			await runInteractive(dir, install);
			select.mockClear();

			await runInteractive(dir, install);
			expect(select.mock.calls.some(([o]) => o.message.startsWith("Enable js "))).toBe(false);
			expect(json(dir, ".opx/config.json").lint?.js).toBe(true);
		});
	});

	describe("runAccept", () => {
		const err = (): string => (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).join("\n");
		beforeEach(() => {
			jest.spyOn(console, "error").mockImplementation(() => {});
		});

		it("enables what the files match, never release, and wires up everything the interactive flow does, with no prompt", async () => {
			const dir = make({ "a.js": "x", "b.md": "x", "package.json": PKG });
			const code = await runAccept(dir, install, { accept: "files" });

			expect(code).toBe(0);
			const cfg = json(dir, ".opx/config.json") as Parsed & { release?: unknown };
			expect(cfg.lint).toMatchObject({ js: true, md: true, json: true });
			expect(cfg.release).toBe(false);
			expect(install).toHaveBeenCalledTimes(1);
			expect(json(dir, "package.json").scripts?.lint).toBe("opx lint");
			expect(read(dir, ".gitignore")).toContain(".opx/*");
			expect(existsSync(join(dir, ".husky/post-commit"))).toBe(true);
			expect(select).not.toHaveBeenCalled();
			expect(confirm).not.toHaveBeenCalled();
		});

		it("enables exactly the named plugins, including release, which files cannot imply", async () => {
			const dir = make({ "a.js": "x", "b.md": "x", "package.json": PKG });
			await runAccept(dir, install, { accept: ["js", "release"] });

			const cfg = json(dir, ".opx/config.json") as Parsed & { release?: unknown };
			expect(cfg.lint).toEqual({ js: true });
			expect(cfg.release).toBe(true);
			expect(install.mock.calls[0]?.[0]).toContain("@allons-y/opx-release");
			expect(install.mock.calls[0]?.[0]).not.toContain("lint-md");
		});

		it("rejects an unknown name before changing anything, and lists the valid ones", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			const code = await runAccept(dir, install, { accept: ["js", "nope"] });

			expect(code).toBe(1);
			expect(err()).toContain("nope");
			expect(err()).toContain("js");
			expect(json(dir, ".opx/config.json").lint).toBeUndefined();
			expect(install).not.toHaveBeenCalled();
		});

		it("keeps the config and does not install again for a plugin that is already set up", async () => {
			const dir = make({ "a.js": "x", "package.json": JSON.stringify({ devDependencies: { "@allons-y/opx-lint-js": "1.0.0" } }), ".opx/config.json": JSON.stringify({ version: 1, lint: { js: "./mine.js" } }) });
			await runAccept(dir, install, { accept: ["js"] });

			expect(json(dir, ".opx/config.json").lint?.js).toBe("./mine.js");
			expect(install).not.toHaveBeenCalled();
			expect(printed()).toContain("js already enabled");
		});

		it("saves the choices, fails, and says how to finish when the install fails", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			install.mockImplementationOnce(() => { throw new Error("boom"); });
			const code = await runAccept(dir, install, { accept: "files" });

			expect(code).toBe(1);
			expect(json(dir, ".opx/config.json").lint?.js).toBe(true);
			expect(err()).toContain("Install failed");
			expect(err()).toContain("@allons-y/opx-lint-js");
		});

		it("prints the install command instead of running it when the package manager is ambiguous", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG, "yarn.lock": "", "package-lock.json": "{}" });
			const code = await runAccept(dir, install, { accept: "files" });

			expect(code).toBe(0);
			expect(install).not.toHaveBeenCalled();
			expect(printed()).toContain("@allons-y/opx-lint-js");
			expect(printed()).toContain("Not sure which package manager");
		});

		it("installs from the dist-tag when asked, because npm can't resolve a bare name with only prereleases", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			await runAccept(dir, install, { accept: "files", tag: "beta" });
			expect(install.mock.calls[0]?.[0]).toContain("@allons-y/opx-lint-js@beta");
		});

		it("keeps lint-js on its JavaScript-only range beside lint-ts, even from a dist-tag", async () => {
			const dir = make({ "a.js": "x", "b.ts": "x", "package.json": PKG });
			await runAccept(dir, install, { accept: ["js", "ts"], tag: "beta" });
			const cmd = String(install.mock.calls[0]?.[0]);
			expect(cmd).toContain("@allons-y/opx-lint-js@^1.0.0-beta.1");
			expect(cmd).toContain("@allons-y/opx-lint-ts@beta");
		});

		it("follows the shared config, upgrades lint-js 0.x, and shows what eslint.config.js lacks", async () => {
			const pkg = JSON.stringify({ name: "host", devDependencies: { "@allons-y/opx-lint-js": "^0.1.0-beta.0" } });
			const config = JSON.stringify({ version: 1, lint: { js: "./eslint.config.js" } });
			const eslint = 'import js from "@allons-y/opx-lint-js/eslint.config.js";\nexport default [...js];\n';
			const dir = make({ "a.ts": "x", "package.json": pkg, ".opx/config.json": config, "eslint.config.js": eslint });
			await runAccept(dir, install, { accept: ["ts"] });

			expect(json(dir, ".opx/config.json").lint?.ts).toBe("./eslint.config.js");
			expect(String(install.mock.calls[0]?.[0])).toContain("@allons-y/opx-lint-js@^1.0.0-beta.1");
			expect(printed()).toContain("Upgrading @allons-y/opx-lint-js too");
			expect(printed()).toContain('import ts from "@allons-y/opx-lint-ts/eslint.config.js";');
			expect(read(dir, "eslint.config.js")).toBe(eslint);
		});

		it("prints cleanup suggestions but deletes nothing", async () => {
			const dir = make({ "a.js": "x", ".eslintrc.json": "{}\n", "package.json": PKG });
			loadDetectors.mockResolvedValue([{ cleanup: () => [{ kind: "file", target: ".eslintrc.json", reason: "not applied" }] } as unknown as Detector]);
			await runAccept(dir, install, { accept: "files", cleanup: true });

			expect(printed()).toContain(".eslintrc.json");
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
			expect(confirm).not.toHaveBeenCalled();
		});
	});

	describe("cleanup", () => {
		const files = {
			"a.js": "x",
			".eslintrc.json": "{}\n",
			".eslintignore": "node_modules\n",
			"package.json": JSON.stringify({ name: "host", devDependencies: { eslint: "^9.0.0" } }),
		};
		const suggestions: CleanupSuggestion[] = [
			{ kind: "file", target: ".eslintrc.json", reason: "not applied" },
			{ kind: "file", target: ".eslintignore", reason: "not applied", hint: "move the patterns" },
			{ kind: "dependency", target: "eslint", reason: "bundled by @acme/opx-x" },
		];
		const detectors = jest.fn(async () => [{ cleanup: () => suggestions }] as unknown as Detector[]);
		const infoText = (): string => logInfo.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

		it("deletes an empty file git can restore once confirmed, and only advises on the rest", async () => {
			const dir = make(files);
			answers({}, "no");
			await runInteractive(dir, install, { cleanup: true, detectors });

			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(false);
			expect(read(dir, ".eslintignore")).toBe("node_modules\n");
			expect(infoText()).toContain("- .eslintignore: not applied");
			expect(infoText()).toContain("move the patterns");
			expect(infoText()).toContain("Drop the unused packages with: npm uninstall eslint");
			expect(install).not.toHaveBeenCalled();
			expect(json(dir, "package.json").scripts).toBeUndefined();
		});

		it("leaves the file when the confirmation is declined or cancelled", async () => {
			answers({}, "no");
			for (const reply of [false, CANCEL]) {
				const dir = make(files);
				confirm.mockResolvedValue(reply);
				await runInteractive(dir, install, { cleanup: true, detectors });
				expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
			}
		});

		it("does not ask when there is nothing to delete", async () => {
			const dir = make({ ...files, ".eslintrc.json": '{ "root": true }' });
			answers({}, "no");
			await runInteractive(dir, install, { cleanup: true, detectors });
			expect(confirm.mock.calls.some(([o]) => o.message.startsWith("Delete"))).toBe(false);
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
		});

		it("does nothing about cleanup unless asked, and loads no plugin", async () => {
			const dir = make(files);
			answers({}, "no");
			await runInteractive(dir, install, { detectors });
			expect(detectors).not.toHaveBeenCalled();
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
		});
	});

	describe("prompts", () => {
		it("offers yes, no, or later for each suggestion, naming the package", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({}, "no");
			await runInteractive(dir, install);

			const prompt = select.mock.calls.find(([o]) => o.message.startsWith("Enable js "))?.[0];
			expect(prompt?.message).toContain("@allons-y/opx-lint-js");
			expect(prompt?.options?.map((o) => o.value)).toEqual(["yes", "no", "later"]);
		});

		it("asks for typescript along with the ts plugin unless the project has it", async () => {
			const dir = make({ "a.ts": "x", "package.json": PKG, "yarn.lock": "" });
			answers({ ts: "yes" });
			await runInteractive(dir, install);
			expect(select.mock.calls.find(([o]) => o.message.startsWith("Enable ts "))?.[0].message).toContain("Requires typescript.");
			expect(confirm.mock.calls.some(([o]) => o.message.includes("yarn add -D @allons-y/opx-lint-ts typescript"))).toBe(true);

			confirm.mockClear();
			const withTs = make({ "a.ts": "x", "package.json": JSON.stringify({ name: "h", devDependencies: { typescript: "^5" } }), "yarn.lock": "" });
			await runInteractive(withTs, install);
			expect(confirm.mock.calls.some(([o]) => o.message.endsWith("yarn add -D @allons-y/opx-lint-ts"))).toBe(true);
		});

		it("shows the command the install prompt would run", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG, "yarn.lock": "" });
			answers({ js: "yes" });
			await runInteractive(dir, install);
			expect(confirm.mock.calls.some(([o]) => o.message.includes("yarn add -D @allons-y/opx-lint-js"))).toBe(true);
		});

		it("leaves the install to the person when its prompt is cancelled", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({ js: "yes" });
			confirm.mockResolvedValue(CANCEL);
			await runInteractive(dir, install);

			expect(install).not.toHaveBeenCalled();
			expect(logInfo).toHaveBeenCalledWith("Run when ready: npm install --save-dev @allons-y/opx-lint-js");
			expect(json(dir, ".opx/config.json").lint?.js).toBe(true);
		});

		it("skips the lint script when its prompt is cancelled", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({ js: "yes" });
			confirm.mockImplementation(async ({ message }) => (message.includes("package.json") ? CANCEL : true));
			await runInteractive(dir, install);
			expect(json(dir, "package.json").scripts).toBeUndefined();
		});

		it("says so when there is nothing new to set up", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			answers({}, "yes");
			await runInteractive(dir, install);
			logSuccess.mockClear();

			await runInteractive(dir, install);
			expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining("No new tooling to suggest"));
		});
	});

	describe("setup output", () => {
		it("scaffolds eslint.config.js for an installed plugin, and says so", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			mkdirSync(join(dir, "node_modules", "@allons-y", "opx-lint-js"), { recursive: true });
			answers({ js: "yes" });
			await runInteractive(dir, install);

			expect(read(dir, "eslint.config.js")).toContain("@allons-y/opx-lint-js/eslint.config.js");
			expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining("Wrote a composable eslint.config.js"));
		});

		it("does not print plugin loading messages while looking for cleanup", async () => {
			const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
			const error = jest.spyOn(console, "error").mockImplementation(() => {});
			loadDetectors.mockImplementation(async (ctx) => {
				const { logger } = ctx as { logger: Record<"info" | "warn" | "error" | "debug", (message: string) => void> };
				for (const level of ["info", "warn", "error", "debug"] as const) logger[level]("plugin x is declared but not installed");
				return [];
			});

			await runInteractive(make({ "a.js": "x", "package.json": PKG }), install, { cleanup: true });
			await runReport(make({ "a.js": "x", "package.json": PKG }), { cleanup: true });

			expect(loadDetectors).toHaveBeenCalledTimes(2);
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
			expect(printed()).not.toContain("declared but not installed");
		});
	});

	describe("runInstall", () => {
		it("splits the command into binary and arguments, and runs it in the project with inherited stdio", async () => {
			execFileSync.mockReturnValueOnce(Buffer.from(""));
			await runInstall("pnpm add -D @allons-y/opx-lint-js", "/proj");
			expect(execFileSync).toHaveBeenCalledWith("pnpm", ["add", "-D", "@allons-y/opx-lint-js"], { cwd: "/proj", stdio: "inherit" });
		});

		it("does nothing for an empty command", async () => {
			await runInstall("", "/proj");
			expect(execFileSync).not.toHaveBeenCalled();
		});

		it("lets a failed install propagate", async () => {
			execFileSync.mockImplementationOnce(() => {
				throw new Error("exit 3");
			});
			await expect(runInstall("npm install x", "/proj")).rejects.toThrow("exit 3");
		});
	});

	describe("the init command", () => {
		const run = async (dir: string, ...args: string[]): Promise<void> => {
			process.chdir(dir);
			const program = new Command().exitOverride();
			register(program);
			await program.parseAsync(["node", "opx", "init", ...args]);
		};
		const project = (): string => make({ "a.js": "x", ".eslintrc.json": "{}\n", "package.json": PKG });
		const suggest: CleanupSuggestion = { kind: "file", target: ".eslintrc.json", reason: "not applied" };

		beforeEach(() => {
			answers({}, "no");
			loadDetectors.mockResolvedValue([{ cleanup: () => [suggest] } as unknown as Detector]);
		});

		it("sets up interactively, then offers to delete the empty file with --cleanup", async () => {
			const dir = project();
			await run(dir, "--cleanup");

			expect(existsSync(join(dir, ".opx/config.json"))).toBe(true);
			expect(confirm.mock.calls.some(([o]) => o.message.startsWith("Delete"))).toBe(true);
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(false);
		});

		it("skips cleanup under --auto, which runs from postinstall, even with --cleanup", async () => {
			const dir = project();
			await run(dir, "--auto", "--cleanup");

			expect(existsSync(join(dir, ".opx/config.json"))).toBe(true);
			expect(loadDetectors).not.toHaveBeenCalled();
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
		});

		it("does no cleanup unless asked", async () => {
			const dir = project();
			await run(dir);

			expect(loadDetectors).not.toHaveBeenCalled();
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
		});

		it("prints a report instead when the shell is not interactive", async () => {
			detectMode.mockReturnValue("report");
			const dir = project();
			await run(dir, "--cleanup");

			expect(select).not.toHaveBeenCalled();
			expect(printed()).toContain("wrote starter .opx/config.json");
			expect(printed()).toContain("cleanup suggestions from your plugins");
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);
		});

		it("accepts without prompting under --yes or --accept, even in a terminal, and exits 1 for an unknown name", async () => {
			jest.spyOn(console, "error").mockImplementation(() => {});
			// Let git run for real; stop only the package manager.
			execFileSync.mockImplementation(((cmd: string, ...rest: unknown[]) => (cmd === "git" ? (childProcess.execFileSync as (...a: unknown[]) => unknown)(cmd, ...rest) : undefined)) as never);
			const dir = project();
			await run(dir, "--accept", "js, md");
			expect(select).not.toHaveBeenCalled();
			expect(json(dir, ".opx/config.json").lint).toMatchObject({ js: true, md: true });
			expect(process.exitCode ?? 0).toBe(0);

			await run(project(), "--yes");
			expect(select).not.toHaveBeenCalled();

			await run(project(), "--accept", "nope");
			expect(process.exitCode).toBe(1);
			process.exitCode = 0;
		});

		it("leaves --auto alone, so a postinstall never changes the project without a terminal", async () => {
			detectMode.mockReturnValue("report");
			const dir = project();
			await run(dir, "--auto", "--yes");
			expect(existsSync(join(dir, ".opx/config.json"))).toBe(false);
		});

		it("only hints under --auto without a terminal", async () => {
			detectMode.mockReturnValue("report");
			await run(project(), "--auto");
			expect(printed()).toContain("run `opx init` in an interactive shell");
			expect(select).not.toHaveBeenCalled();
		});
	});

	describe("runReport", () => {
		it("writes a starter config and lists unconfigured detectors", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			await runReport(dir);

			expect(existsSync(join(dir, ".opx/config.json"))).toBe(true);
			expect(printed()).toContain("wrote starter .opx/config.json");
			expect(printed()).toContain("opx enable js");
		});

		it("lists typescript in the install command for ts, unless the project has it", async () => {
			await runReport(make({ "a.ts": "x", "package.json": PKG }));
			expect(printed()).toContain("install @allons-y/opx-lint-ts typescript, then run `opx enable ts`");

			log.mockClear();
			await runReport(make({ "a.ts": "x", "package.json": JSON.stringify({ name: "h", devDependencies: { typescript: "^5" } }) }));
			expect(printed()).toContain("install @allons-y/opx-lint-ts, then run `opx enable ts`");
		});

		it("lists the plugins' cleanup suggestions without changing anything, only when asked", async () => {
			const dir = make({ "a.js": "x", ".eslintrc.json": "{}", "package.json": JSON.stringify({ name: "host", devDependencies: { eslint: "^9.0.0" } }) });
			const detectors = async (): Promise<Detector[]> => [
				{ cleanup: () => [{ kind: "file", target: ".eslintrc.json", reason: "not applied" }, { kind: "dependency", target: "eslint", reason: "bundled" }] } as unknown as Detector,
			];

			await runReport(dir, { cleanup: true, detectors });
			expect(printed()).toContain("cleanup suggestions from your plugins");
			expect(printed()).toContain("  - .eslintrc.json");
			expect(printed()).toContain("Drop the unused packages with: npm uninstall eslint");
			expect(existsSync(join(dir, ".eslintrc.json"))).toBe(true);

			log.mockClear();
			await runReport(dir, { detectors });
			expect(printed()).not.toContain("cleanup suggestions");
		});

		it("says nothing is new when every detector is configured", async () => {
			const dir = make({ "README.txt": "x" });
			await runReport(dir);
			const cfg = json(dir, ".opx/config.json");
			writeFileSync(join(dir, ".opx/config.json"), JSON.stringify({ ...cfg, release: true }));
			log.mockClear();
			await runReport(dir);
			expect(printed()).toBe("opx: nothing new to suggest.");
		});
	});
});
