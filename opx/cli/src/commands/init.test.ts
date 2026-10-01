import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANCEL = Symbol("cancel");
const select = jest.fn<(o: { message: string }) => Promise<unknown>>();
const confirm = jest.fn<(o: { message: string }) => Promise<unknown>>();
const cancel = jest.fn();

jest.unstable_mockModule("@clack/prompts", () => ({
	intro: jest.fn(),
	outro: jest.fn(),
	cancel,
	select,
	confirm,
	isCancel: (v: unknown) => v === CANCEL,
	log: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { runInteractive, runReport } = await import("./init.js");

/** A git repo with one commit holding the given files. */
function repo(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-init-"));
	const opts = { cwd: dir, stdio: "ignore" as const };
	execFileSync("git", ["init", "-b", "main"], opts);
	execFileSync("git", ["config", "user.email", "t@t.io"], opts);
	execFileSync("git", ["config", "user.name", "t"], opts);
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf8");
	execFileSync("git", ["add", "."], opts);
	execFileSync("git", ["commit", "-m", "init"], opts);
	return dir;
}

const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");
type Parsed = {
	lint?: Record<string, unknown>;
	scripts?: Record<string, string>;
	deferrals: Record<string, { branch: string; reason: string; skipUntilDate: string }>;
};
const json = (dir: string, file: string): Parsed => JSON.parse(read(dir, file)) as Parsed;
const PKG = JSON.stringify({ name: "host", version: "1.0.0" });

describe("init", () => {
	const dirs: string[] = [];
	const install = jest.fn<(cmd: string, cwd: string) => void>();
	let log: ReturnType<typeof jest.spyOn>;

	const make = (files: Record<string, string>): string => {
		const dir = repo(files);
		dirs.push(dir);
		return dir;
	};
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
	});
	afterEach(() => {
		jest.restoreAllMocks();
		for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
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

	describe("runReport", () => {
		it("writes a starter config and lists unconfigured detectors", () => {
			const dir = make({ "a.js": "x", "package.json": PKG });
			runReport(dir);

			expect(existsSync(join(dir, ".opx/config.json"))).toBe(true);
			expect(printed()).toContain("wrote starter .opx/config.json");
			expect(printed()).toContain("opx enable js");
		});

		it("says nothing is new when every detector is configured", () => {
			const dir = make({ "README.txt": "x" });
			runReport(dir);
			const cfg = json(dir, ".opx/config.json");
			writeFileSync(join(dir, ".opx/config.json"), JSON.stringify({ ...cfg, release: true }));
			log.mockClear();
			runReport(dir);
			expect(printed()).toBe("opx: nothing new to suggest.");
		});
	});
});
