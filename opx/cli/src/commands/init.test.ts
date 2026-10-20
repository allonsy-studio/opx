import { jest } from "@jest/globals";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CleanupSuggestion, Detector } from "@allons-y/opx";
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

const builtIn = await import("../built-in.js");
jest.unstable_mockModule("../built-in.js", () => ({ ...builtIn, load: loadDetectors }));

const { default: register, runInstall, runInteractive, runReport } = await import("./init.js");

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
			expect(existsSync(join(dir, ".git/hooks/post-commit")) || existsSync(join(dir, ".husky/post-commit"))).toBe(true);
			expect(read(dir, ".gitignore")).toContain(".opx/*");
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

		it("installs with the package manager the project uses, bun and workspace roots included", async () => {
			answers({ js: "yes" });
			const bun = make({ "a.js": "x", "package.json": PKG, "bun.lock": "" });
			await runInteractive(bun, install);
			expect(install).toHaveBeenLastCalledWith("bun add -d @allons-y/opx-lint-js", bun);

			const pnpm = make({ "a.js": "x", "package.json": PKG, "pnpm-lock.yaml": "", "pnpm-workspace.yaml": "" });
			await runInteractive(pnpm, install);
			expect(install).toHaveBeenLastCalledWith("pnpm add -D -w @allons-y/opx-lint-js", pnpm);
		});

		it("shows the command instead of running it when the project points at several package managers", async () => {
			const dir = make({ "a.js": "x", "package.json": PKG, "yarn.lock": "", "package-lock.json": "{}" });
			answers({ js: "yes" });
			await runInteractive(dir, install);

			expect(install).not.toHaveBeenCalled();
			expect(confirm.mock.calls.some(([o]) => o.message.startsWith("Install"))).toBe(false);
			const warned = logWarn.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
			expect(warned).toContain("lockfiles for yarn and npm");
			expect(warned).toContain("yarn add -D @allons-y/opx-lint-js");
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
		it("runs the command in the project", async () => {
			await expect(runInstall("node -e 0", make({}))).resolves.toBeUndefined();
		});

		it("does nothing for an empty command", async () => {
			await expect(runInstall("", make({}))).resolves.toBeUndefined();
		});

		it("fails when the command fails", async () => {
			await expect(runInstall("node -e process.exit(3)", make({}))).rejects.toThrow();
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
