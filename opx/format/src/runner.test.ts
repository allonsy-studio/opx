import { join, resolve } from "node:path";

import { jest } from "@jest/globals";
import type { DetectorContext, OpxConfig } from "@allons-y/opx";

import { configFile, formatExtensions, runFormat, type FormatDeps, type PrettierResult } from "./runner.js";

/** A context with the pieces the runner reads. */
function makeCtx(
	overrides: Partial<DetectorContext> = {},
	lint?: OpxConfig["lint"],
): { ctx: DetectorContext; out: string[] } {
	const out: string[] = [];
	const ctx = {
		cwd: "/repo",
		fix: false,
		dryRun: false,
		config: { version: 1, lint },
		write: (chunk: string) => out.push(chunk),
		...overrides,
	} as unknown as DetectorContext;
	return { ctx, out };
}

/** Deps whose Prettier returns `result` and records its arguments. */
function makeDeps(result: Partial<PrettierResult> = {}): {
	deps: FormatDeps;
	prettier: jest.Mock<FormatDeps["prettier"]>;
} {
	const prettier = jest
		.fn<FormatDeps["prettier"]>()
		.mockResolvedValue({ code: 0, stdout: "", stderr: "", ...result });
	return { deps: { prettier }, prettier };
}

describe("runFormat arguments", () => {
	it("checks by default and reads both ignore files", async () => {
		const { ctx } = makeCtx();
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, [], deps);
		const [args, cwd] = prettier.mock.calls[0]!;
		expect(args.slice(0, 3)).toEqual(["--check", "--log-level", "warn"]);
		expect(args).not.toContain("--write");
		expect(args).toEqual(
			expect.arrayContaining(["--ignore-path", join("/repo", ".gitignore"), join("/repo", ".prettierignore")]),
		);
		expect(cwd).toBe("/repo");
	});

	it("turns Prettier's color off so its output parses the same everywhere", async () => {
		const { ctx } = makeCtx();
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, [], deps);
		expect(prettier.mock.calls[0]![0]).toContain("--no-color");
	});

	it("writes when fix is set", async () => {
		const { ctx } = makeCtx({ fix: true });
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, [], deps);
		const [args] = prettier.mock.calls[0]!;
		expect(args).toEqual(expect.arrayContaining(["--write", "--list-different"]));
		expect(args).not.toContain("--check");
	});

	it("checks, not writes, on a dry run", async () => {
		const { ctx } = makeCtx({ fix: true, dryRun: true });
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, [], deps);
		expect(prettier.mock.calls[0]![0]).toContain("--check");
	});

	it("formats the file types of every opx lint plugin when none narrows it", async () => {
		const { ctx } = makeCtx();
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, [], deps);
		const glob = prettier.mock.calls[0]![0].find((arg) => arg.startsWith("**/*."))!;
		for (const ext of ["js", "ts", "json", "md"]) expect(glob).toContain(ext);
	});

	it("keeps vendored and generated folders out of the run", async () => {
		const { ctx } = makeCtx();
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, ["src"], deps);
		expect(prettier.mock.calls[0]![0]).toEqual(
			expect.arrayContaining(["!**/node_modules/**", "!**/.yarn/**", "!**/.opx/**"]),
		);
	});

	it("forwards the paths it owns and drops the rest", async () => {
		const { ctx } = makeCtx();
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, ["src/a.ts", "styles.css", "docs"], deps);
		const args = prettier.mock.calls[0]![0];
		expect(args).toEqual(expect.arrayContaining(["src/a.ts", "docs"]));
		expect(args).not.toContain("styles.css");
	});

	it("does nothing when no forwarded path is one it formats", async () => {
		const { ctx } = makeCtx();
		const { deps, prettier } = makeDeps();
		expect(await runFormat(ctx, ["styles.css"], deps)).toBe(0);
		expect(prettier).not.toHaveBeenCalled();
	});
});

describe("format extensions", () => {
	it("follow the enabled lint plugins that opx knows", () => {
		const { ctx } = makeCtx({}, { md: true, json: false, "opx-plugin-css": true });
		expect([...formatExtensions(ctx)]).toEqual([".md", ".mdx"]);
	});

	it("fall back to every known file type when only unknown plugins are enabled", () => {
		const { ctx } = makeCtx({}, { "opx-plugin-css": true });
		expect(formatExtensions(ctx).has(".ts")).toBe(true);
	});
});

describe("config resolution", () => {
	it("uses the bundled config by default", () => {
		const { ctx } = makeCtx();
		expect(configFile(ctx)).toMatch(/prettier\.config\.js$/);
		expect(configFile(ctx)).not.toContain("/repo");
	});

	it("uses the bundled config when format is true", () => {
		const { ctx } = makeCtx({}, { format: true });
		expect(configFile(ctx)).toBe(configFile(makeCtx().ctx));
	});

	it("resolves a string setting from the repository root", () => {
		const { ctx } = makeCtx({}, { format: "configs/prettier.config.js" });
		expect(configFile(ctx)).toBe(resolve("/repo", "configs/prettier.config.js"));
	});

	it("keeps an absolute path as written", () => {
		const { ctx } = makeCtx({}, { format: resolve("/etc/prettier.config.js") });
		expect(configFile(ctx)).toBe(resolve("/etc/prettier.config.js"));
	});

	it("passes the chosen config to Prettier", async () => {
		const { ctx } = makeCtx({}, { format: "my.config.js" });
		const { deps, prettier } = makeDeps();
		await runFormat(ctx, [], deps);
		const args = prettier.mock.calls[0]![0];
		expect(args[args.indexOf("--config") + 1]).toBe(resolve("/repo", "my.config.js"));
	});
});

describe("runFormat results", () => {
	it("is silent and passes when nothing needs formatting", async () => {
		const { ctx, out } = makeCtx();
		expect(await runFormat(ctx, [], makeDeps().deps)).toBe(0);
		expect(out).toEqual([]);
	});

	it("lists the files that need formatting, says how to fix them, and fails", async () => {
		const { ctx, out } = makeCtx();
		const stderr =
			"[warn] src/a.ts\n[warn] src/b.ts\n[warn] Code style issues found in 2 files. Run Prettier with --write to fix.\n";
		expect(await runFormat(ctx, [], makeDeps({ code: 1, stderr }).deps)).toBe(1);
		expect(out.join("")).toBe(
			"2 files need formatting:\n  src/a.ts\n  src/b.ts\nRun `opx lint --fix` to write the changes.\n",
		);
	});

	it("uses the singular for one file", async () => {
		const { ctx, out } = makeCtx();
		const stderr =
			"[warn] a.ts\n[warn] Code style issues found in the above file. Run Prettier with --write to fix.\n";
		await runFormat(ctx, [], makeDeps({ code: 1, stderr }).deps);
		expect(out.join("")).toMatch(/^1 file needs formatting:/);
	});

	it("reports the files it wrote and passes", async () => {
		const { ctx, out } = makeCtx({ fix: true });
		expect(await runFormat(ctx, [], makeDeps({ stdout: "src/a.ts\nsrc/b.ts\n" }).deps)).toBe(0);
		expect(out.join("")).toBe("Formatted 2 files:\n  src/a.ts\n  src/b.ts\n");
	});

	it("reports a file Prettier can't parse without its log prefix, and fails", async () => {
		const { ctx, out } = makeCtx({ fix: true });
		const stderr = "[error] bad.js: SyntaxError: Unexpected token (1:7)\n[error] > 1 | const = ;\n";
		expect(await runFormat(ctx, [], makeDeps({ code: 2, stderr }).deps)).toBe(1);
		expect(out.join("")).toBe("bad.js: SyntaxError: Unexpected token (1:7)\n> 1 | const = ;\n");
	});

	it("reports unformatted files and parse errors together", async () => {
		const { ctx, out } = makeCtx();
		const stderr = "[warn] a.ts\n[error] bad.js: SyntaxError\n";
		expect(await runFormat(ctx, [], makeDeps({ code: 2, stderr }).deps)).toBe(1);
		expect(out.join("")).toContain("1 file needs formatting:");
		expect(out.join("")).toContain("bad.js: SyntaxError");
	});

	it("fails with Prettier's output when it exits non-zero without a recognizable message", async () => {
		const { ctx, out } = makeCtx();
		expect(await runFormat(ctx, [], makeDeps({ code: 3, stderr: "boom" }).deps)).toBe(1);
		expect(out.join("")).toBe("prettier exited with code 3.\nboom\n");
	});
});
