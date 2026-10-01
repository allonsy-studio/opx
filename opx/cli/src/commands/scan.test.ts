import { jest } from "@jest/globals";

import type { DetectorContext } from "@allons-y/opx";

import { runScan } from "./scan.js";

type Over = {
	fileTypes?: string[];
	lint?: Record<string, unknown>;
	release?: boolean;
	deps?: Record<string, string>;
};

function ctx(over: Over = {}): DetectorContext {
	return {
		cwd: "/tmp/x",
		branch: "main",
		fileTypes: new Set(over.fileTypes ?? [".js", ".md"]),
		hostPkg: { devDependencies: over.deps ?? {} },
		config: { version: 1, lint: over.lint ?? {}, build: {}, release: over.release ?? false, test: false },
	} as unknown as DetectorContext;
}

const flags = (over: Partial<{ report: boolean; json: boolean; strict: boolean }> = {}) => ({ report: false, json: false, strict: false, ...over });

describe("runScan", () => {
	let log: ReturnType<typeof jest.spyOn>;
	let write: ReturnType<typeof jest.spyOn>;
	const saved = { ci: process.env.CI, ni: process.env.OPX_NONINTERACTIVE, tty: process.stdout.isTTY };

	const printed = (): string => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
	const written = (): string => write.mock.calls.map((c: unknown[]) => String(c[0])).join("");
	const interactive = (on: boolean): void => {
		delete process.env.CI;
		delete process.env.OPX_NONINTERACTIVE;
		Object.defineProperty(process.stdout, "isTTY", { value: on, configurable: true });
	};

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
		interactive(false);
	});
	afterEach(() => {
		jest.restoreAllMocks();
		if (saved.ci === undefined) delete process.env.CI; else process.env.CI = saved.ci;
		if (saved.ni === undefined) delete process.env.OPX_NONINTERACTIVE; else process.env.OPX_NONINTERACTIVE = saved.ni;
		Object.defineProperty(process.stdout, "isTTY", { value: saved.tty, configurable: true });
	});

	describe("--json", () => {
		it("prints the branch, sorted file types, enabled plugins, suggestions, and what needs a prompt", () => {
			const code = runScan(ctx({ fileTypes: [".md", ".js"], lint: { js: true } }), flags({ json: true }));
			expect(code).toBe(0);
			const payload = JSON.parse(written());
			expect(payload.branch).toBe("main");
			expect(payload.fileTypes).toEqual([".js", ".md"]);
			expect(payload.enabled).toEqual(["js"]);
			expect(payload.needsPrompt).toEqual(["md"]);
			expect(payload.suggestions.map((s: { shortName: string }) => s.shortName)).toEqual(expect.arrayContaining(["js", "md", "release"]));
		});

		it("flags whether each suggested package is installed", () => {
			const payload = (() => {
				runScan(ctx({ deps: { "@allons-y/opx-lint-md": "1" } }), flags({ json: true }));
				return JSON.parse(written());
			})();
			const byPkg = Object.fromEntries(payload.suggestions.map((s: { pkg: string; installed: boolean }) => [s.pkg, s.installed]));
			expect(byPkg["@allons-y/opx-lint-md"]).toBe(true);
			expect(byPkg["@allons-y/opx-lint-js"]).toBe(false);
		});

		it("lists release as enabled, and never as needing a prompt", () => {
			runScan(ctx({ release: true }), flags({ json: true }));
			expect(JSON.parse(written()).enabled).toContain("release");
			write.mockClear();
			runScan(ctx({ release: false }), flags({ json: true }));
			expect(JSON.parse(written()).needsPrompt).not.toContain("release");
		});

		it("treats a plugin set to false as not enabled", () => {
			runScan(ctx({ lint: { md: false } }), flags({ json: true }));
			const payload = JSON.parse(written());
			expect(payload.enabled).not.toContain("md");
			expect(payload.needsPrompt).toContain("md");
		});
	});

	describe("--strict", () => {
		it("exits 1 when a file-based plugin matches but isn't enabled", () => {
			expect(runScan(ctx({ lint: { js: true } }), flags({ strict: true }))).toBe(1);
		});

		it("exits 0 when every matching plugin is enabled", () => {
			expect(runScan(ctx({ lint: { js: true, md: true } }), flags({ strict: true }))).toBe(0);
		});

		it("exits 0 when only release is missing", () => {
			expect(runScan(ctx({ fileTypes: [".js"], lint: { js: true }, release: false }), flags({ strict: true }))).toBe(0);
		});

		it("exits 0 without --strict even when plugins are missing", () => {
			expect(runScan(ctx(), flags())).toBe(0);
		});
	});

	describe("text output", () => {
		it("lists file types and each plugin's status in report mode", () => {
			runScan(ctx({ fileTypes: [".md", ".js"], lint: { js: true }, deps: { "@allons-y/opx-lint-md": "1" } }), flags({ report: true }));
			const out = printed();
			expect(out).toContain("File types in committed tree: .js, .md");
			expect(out).toContain("Enabled lint detectors: js");
			expect(out).toContain("[enabled]");
			expect(out).toContain("[installed, not enabled]");
			expect(out).toContain("[not installed]");
		});

		it("says so when nothing is enabled and nothing matches", () => {
			runScan(ctx({ fileTypes: [] }), flags({ report: true }));
			expect(printed()).toContain("(none)");
		});

		it("falls back to report output in a non-interactive shell", () => {
			runScan(ctx(), flags());
			expect(printed()).not.toContain("opx init");
		});

		it("adds a hint to run init in an interactive shell", () => {
			interactive(true);
			runScan(ctx(), flags());
			expect(printed()).toContain("Run `opx init`");
		});

		it("lets --report override an interactive shell", () => {
			interactive(true);
			runScan(ctx(), flags({ report: true }));
			expect(printed()).not.toContain("Run `opx init`");
		});
	});
});
