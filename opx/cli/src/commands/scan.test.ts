import { jest } from "@jest/globals";

import type { DetectorContext } from "@allons-y/opx";

import { runScan } from "./scan.js";

type Over = {
	fileTypes?: string[];
	lint?: Record<string, unknown>;
	release?: boolean;
	deps?: Record<string, string>;
	pm?: string;
};

function ctx(over: Over = {}): DetectorContext {
	return {
		cwd: "/tmp/x",
		branch: "main",
		fileTypes: new Set(over.fileTypes ?? [".js", ".md"]),
		hostPkg: { devDependencies: over.deps ?? {}, packageManager: over.pm },
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

	describe("--json setup commands", () => {
		it("gives the install command for the project's package manager, naming only what is missing, and the init command that enables it", () => {
			runScan(ctx({ fileTypes: [".js", ".md"], pm: "pnpm@9.0.0", deps: { "@allons-y/opx-lint-js": "1.0.0" } }), flags({ json: true }));
			const payload = JSON.parse(written());
			expect(payload.install).toBe("pnpm add -D @allons-y/opx-lint-md");
			expect(payload.setup).toBe("opx init --accept js,md");
			expect(payload.packageManager).toMatchObject({ name: "pnpm", certain: true });
		});

		it("pins the install to the CLI's dist-tag when it is a prerelease", () => {
			runScan(ctx({ fileTypes: [".js"], pm: "npm@10.0.0" }), flags({ json: true }), "beta");
			expect(JSON.parse(written()).install).toBe("npm install --save-dev @allons-y/opx-lint-js@beta");
		});

		it("has nothing to install or set up when every matching plugin is enabled and installed", () => {
			runScan(ctx({ fileTypes: [".js"], lint: { js: true }, deps: { "@allons-y/opx-lint-js": "1.0.0" } }), flags({ json: true }));
			const payload = JSON.parse(written());
			expect(payload.install).toBeNull();
			expect(payload.setup).toBeNull();
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

		it("names the packages a suggestion needs the project to install", () => {
			runScan(ctx({ fileTypes: [".ts"] }), flags({ report: true }));
			expect(printed()).toContain("ts (@allons-y/opx-lint-ts)");
			expect(printed()).toContain("Requires typescript.");
		});

		it("says so when nothing is enabled and nothing matches", () => {
			runScan(ctx({ fileTypes: [] }), flags({ report: true }));
			expect(printed()).toContain("(none)");
		});

		it("falls back to report output in a non-interactive shell", () => {
			runScan(ctx(), flags());
			expect(printed()).toContain("File types in committed tree");
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
