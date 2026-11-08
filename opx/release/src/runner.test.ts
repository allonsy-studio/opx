import { jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

// Controls how the mocked spawn behaves for the next call.
let spawnBehavior: { code?: number; error?: Error; effect?: () => void } = { code: 0 };
const spawnCalls: Array<{ cmd: string; args: string[]; opts: unknown }> = [];

const spawn = jest.fn((cmd: string, args: string[], opts: unknown) => {
	spawnCalls.push({ cmd, args, opts });
	const ee = new EventEmitter();
	const behavior = spawnBehavior;
	queueMicrotask(() => {
		behavior.effect?.();
		if (behavior.error) ee.emit("error", behavior.error);
		else ee.emit("close", behavior.code ?? 0);
	});
	return ee;
});

const actualChildProcess = await import("node:child_process");
jest.unstable_mockModule("node:child_process", () => ({
	__esModule: true,
	...actualChildProcess,
	spawn,
}));

const { changesetReadme, CUSTOM_CHANGELOG, detectRepo, formatReleaseDate, init, isSnapshot, parseInitArgs, releaseDateEnabled, runRelease, stampReleaseDates, starterConfig } = await import("./runner.js");
const { parse } = await import("@changesets/config");

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-rel-"));
}

function ctx(cwd: string): DetectorContext {
	return { cwd, config: { version: 1, release: true } } as unknown as DetectorContext;
}

beforeEach(() => {
	spawnBehavior = { code: 0 };
	spawnCalls.length = 0;
});

describe("init baseBranch", () => {
	it("uses the repository's own default branch", () => {
		const dir = tmp();
		try {
			mkdirSync(join(dir, ".git", "refs", "heads"), { recursive: true });
			writeFileSync(join(dir, ".git", "refs", "heads", "master"), "abc\n");
			init(ctx(dir));
			expect(JSON.parse(readFileSync(join(dir, ".changeset", "config.json"), "utf8")).baseBranch).toBe("master");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("init", () => {
	it("writes config + README and is idempotent", () => {
		const dir = tmp();
		try {
			const cfg = join(dir, ".changeset", "config.json");
			expect(init(ctx(dir))).toBe(true);
			expect(existsSync(cfg)).toBe(true);
			expect(existsSync(join(dir, ".changeset", "README.md"))).toBe(true);

			const parsed = JSON.parse(readFileSync(cfg, "utf8"));
			expect(parsed.changelog).toBe("@changesets/cli/changelog");
			expect(parsed.baseBranch).toBe("main");

			// No git repository here, so it falls back to main.
			// Second call: config already present → returns false.
			expect(init(ctx(dir))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("starter config", () => {
	it("writes the shipped config.json plus baseBranch", () => {
		const dir = tmp();
		try {
			init(ctx(dir));
			const written = JSON.parse(readFileSync(join(dir, ".changeset", "config.json"), "utf8"));
			expect(written).toEqual({ ...starterConfig(), baseBranch: "main" });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("passes changesets' own validation", () => {
		const packages = { tool: "yarn", root: { dir: "/r", packageJson: { name: "root", version: "0.0.0" } }, packages: [] };
		expect(() => parse({ ...starterConfig(), baseBranch: "main" } as never, packages as never)).not.toThrow();
	});

	it("only uses keys changesets reads, which its validation doesn't check", () => {
		const known = ["$schema", "changelog", "commit", "fixed", "linked", "access", "baseBranch", "updateInternalDependencies", "ignore", "privatePackages", "bumpVersionsWithWorkspaceProtocolOnly", "snapshot", "prettier", "changedFilePatterns", "___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH"];
		expect(Object.keys(starterConfig()).filter((key) => !known.includes(key))).toEqual([]);
	});

	it("writes a README that says when a changeset is needed", () => {
		const dir = tmp();
		try {
			init(ctx(dir));
			const readme = readFileSync(join(dir, ".changeset", "README.md"), "utf8");
			expect(readme).toMatch(/need none/);
			expect(readme).toMatch(/`\w+( run)? changeset`/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each([
		["npm", "npm run changeset"],
		["yarn", "yarn changeset"],
		["pnpm", "pnpm changeset"],
		["bun", "bun run changeset"],
	] as const)("tells %s users to run `%s`", (pm, command) => {
		expect(changesetReadme(pm)).toContain(`\`${command}\``);
	});

	it("detects the package manager when the context has none", () => {
		const dir = tmp();
		try {
			init({ ...ctx(dir), hostPkg: { packageManager: "bun@1.2.0" } } as unknown as DetectorContext);
			expect(readFileSync(join(dir, ".changeset", "README.md"), "utf8")).toContain("`bun run changeset`");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("uses the repository's package manager", () => {
		const dir = tmp();
		try {
			init({ ...ctx(dir), pkgManager: "pnpm" });
			expect(readFileSync(join(dir, ".changeset", "README.md"), "utf8")).toContain("`pnpm changeset`");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runRelease", () => {
	it("'init' performs only the lightweight setup and never spawns", async () => {
		const dir = tmp();
		try {
			const code = await runRelease(ctx(dir), ["init"]);
			expect(code).toBe(0);
			expect(existsSync(join(dir, ".changeset", "config.json"))).toBe(true);
			expect(spawn).not.toHaveBeenCalled();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("with no args forwards 'status' to the changesets CLI and resolves 0", async () => {
		const dir = tmp();
		try {
			const code = await runRelease(ctx(dir), []);
			expect(code).toBe(0);
			expect(spawn).toHaveBeenCalledTimes(1);
			const call = spawnCalls[0]!;
			expect(call.args[0]).toMatch(/@changesets[\\/]+cli[\\/]+bin\.js$/);
			expect(call.args.slice(1)).toEqual(["status"]);
			expect(call.opts).toMatchObject({ cwd: dir, stdio: "inherit" });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("forwards a non-interactive subcommand + args verbatim", async () => {
		const dir = tmp();
		try {
			await runRelease(ctx(dir), ["version", "--snapshot", "canary"]);
			expect(spawnCalls[0]!.args.slice(1)).toEqual(["version", "--snapshot", "canary"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("handles 'add' natively and never spawns the changesets CLI", async () => {
		const dir = tmp();
		const spy = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			// No flags + no TTY in the test runner: opx refuses rather than spawning interactive `changeset add`.
			const code = await runRelease(ctx(dir), ["add"]);
			expect(code).toBe(1);
			expect(spawn).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});


	it("resolves to the child's non-zero exit code", async () => {
		const dir = tmp();
		try {
			spawnBehavior = { code: 1 };
			expect(await runRelease(ctx(dir), ["status"])).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("resolves 0 when the child closes with a null exit code", async () => {
		const dir = tmp();
		try {
			spawnBehavior = { code: undefined };
			expect(await runRelease(ctx(dir), ["status"])).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("resolves to 1 when the child emits an error", async () => {
		const dir = tmp();
		const spy = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			spawnBehavior = { error: new Error("boom") };
			expect(await runRelease(ctx(dir), ["status"])).toBe(1);
			expect(spy).toHaveBeenCalledWith(expect.stringContaining("boom"));
		} finally {
			spy.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("custom changelog opt-in", () => {
	const readConfig = (dir: string) => JSON.parse(readFileSync(join(dir, ".changeset", "config.json"), "utf8"));

	it("parses --changelog and --maintainer", () => {
		expect(parseInitArgs(["--changelog", "--maintainer", "@a,b", "--maintainer", "c"])).toEqual({ changelog: true, maintainers: ["a", "b", "c"], releaseDate: false });
		expect(parseInitArgs(["--changelog", "--date"])).toEqual({ changelog: true, maintainers: [], releaseDate: true });
		expect(parseInitArgs([])).toEqual({ changelog: false, maintainers: [], releaseDate: false });
	});

	it.each([
		[{ type: "git", url: "git+https://github.com/acme/widgets.git" }, "acme/widgets"],
		["github:acme/widgets", "acme/widgets"],
		["acme/widgets", "acme/widgets"],
		["git@github.com:acme/widgets.git", "acme/widgets"],
		["https://gitlab.com/acme/widgets", undefined],
	])("detects the repo from %j", (repository, expected) => {
		const dir = tmp();
		try {
			writeFileSync(join(dir, "package.json"), JSON.stringify({ repository }));
			expect(detectRepo(dir)).toBe(expected);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("keeps existing options when run again with --date", async () => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			mkdirSync(join(dir, ".changeset"));
			const existing = { repo: "acme/fork", maintainers: ["ada"], disableThanks: true };
			writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ changelog: [CUSTOM_CHANGELOG, existing] }));
			writeFileSync(join(dir, "package.json"), JSON.stringify({ repository: "github:acme/widgets" }));
			await runRelease(ctx(dir), ["init", "--changelog", "--date"]);
			expect(readConfig(dir).changelog).toEqual([CUSTOM_CHANGELOG, { ...existing, releaseDate: true }]);
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("replaces another generator's options instead of merging them", async () => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			mkdirSync(join(dir, ".changeset"));
			writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ changelog: ["@changesets/changelog-github", { repo: "acme/widgets" }] }));
			await runRelease(ctx(dir), ["init", "--changelog"]);
			expect(readConfig(dir).changelog).toEqual([CUSTOM_CHANGELOG, {}]);
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("'init --date' alone also opts in to the custom changelog", async () => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			await runRelease(ctx(dir), ["init", "--date"]);
			expect(readConfig(dir).changelog).toEqual([CUSTOM_CHANGELOG, { releaseDate: true }]);
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("keeps the default generator without the flag", async () => {
		const dir = tmp();
		try {
			await runRelease(ctx(dir), ["init"]);
			expect(readConfig(dir).changelog).toBe("@changesets/cli/changelog");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("'init --changelog' writes the generator with repo and maintainers", async () => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			writeFileSync(join(dir, "package.json"), JSON.stringify({ repository: "github:acme/widgets" }));
			expect(await runRelease(ctx(dir), ["init", "--changelog", "--maintainer", "ada"])).toBe(0);
			expect(readConfig(dir).changelog).toEqual([CUSTOM_CHANGELOG, { repo: "acme/widgets", maintainers: ["ada"] }]);
			expect(spawnCalls).toHaveLength(0);
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("updates an existing config without touching other fields", async () => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			mkdirSync(join(dir, ".changeset"));
			writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ baseBranch: "trunk", ignore: ["docs"], changelog: "x" }));
			await runRelease(ctx(dir), ["init", "--changelog"]);
			expect(readConfig(dir)).toEqual({ baseBranch: "trunk", ignore: ["docs"], changelog: [CUSTOM_CHANGELOG, {}] });
			expect(log).toHaveBeenCalledWith(expect.stringContaining("no GitHub repository"));
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("release dates", () => {
	const CHANGELOG = "# pkg\n\n## 1.1.0\n\n### Minor Changes\n\n- New thing.\n\n## 1.0.0\n\n### Major Changes\n\n- First.\n";

	it("stamps only the new version's heading, once", () => {
		const dir = tmp();
		try {
			writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG);
			expect(stampReleaseDates([{ dir, version: "1.1.0" }], "8 November 2026")).toEqual([join(dir, "CHANGELOG.md")]);
			expect(stampReleaseDates([{ dir, version: "1.1.0" }], "9 November 2026")).toEqual([]);
			const out = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
			expect(out).toContain("## 1.1.0\n\n📅 _Released 8 November 2026_\n\n### Minor Changes");
			expect(out).toContain("## 1.0.0\n\n### Major Changes");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("matches prerelease versions exactly and skips missing changelogs", () => {
		const dir = tmp();
		try {
			writeFileSync(join(dir, "CHANGELOG.md"), "# pkg\n\n## 1.0.0-beta.10\n\n- x\n\n## 1.0.0-beta.1\n\n- y\n");
			stampReleaseDates([{ dir, version: "1.0.0-beta.1" }, { dir: join(dir, "nope"), version: "1.0.0" }], "8 November 2026");
			const out = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
			expect(out).toContain("## 1.0.0-beta.10\n\n- x");
			expect(out).toContain("## 1.0.0-beta.1\n\n📅 _Released 8 November 2026_\n");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each([
		["2026-11-08T23:59:00Z", "8 November 2026"],
		["2026-01-01T00:00:00Z", "1 January 2026"],
		["2026-12-31T12:00:00Z", "31 December 2026"],
	])("formats %s as %s in UTC", (iso, expected) => {
		expect(formatReleaseDate(new Date(iso))).toBe(expected);
	});

	it("keeps CRLF line endings", () => {
		const dir = tmp();
		try {
			writeFileSync(join(dir, "CHANGELOG.md"), "# pkg\r\n\r\n## 1.1.0\r\n\r\n- x\r\n");
			expect(stampReleaseDates([{ dir, version: "1.1.0" }], "8 November 2026")).toHaveLength(1);
			expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toBe("# pkg\r\n\r\n## 1.1.0\r\n\r\n📅 _Released 8 November 2026_\r\n\r\n- x\r\n");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each([
		[["version"], false],
		[["version", "--snapshot"], true],
		[["version", "--snapshot", "canary"], true],
		[["version", "--snapshot=canary"], true],
		[["version", "--snapshot-prerelease-template", "x"], false],
	])("isSnapshot(%j) is %s", (args, expected) => {
		expect(isSnapshot(args)).toBe(expected);
	});

	it("leaves a heading alone when it already has a dated line", () => {
		const dir = tmp();
		try {
			writeFileSync(join(dir, "CHANGELOG.md"), "# pkg\n\n## 1.1.0\n\n📅 _Released 1 May 2026_\n\n- x\n");
			expect(stampReleaseDates([{ dir, version: "1.1.0" }], "8 November 2026")).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("is enabled only by the custom changelog's releaseDate option", () => {
		const dir = tmp();
		try {
			mkdirSync(join(dir, ".changeset"));
			const write = (changelog: unknown) => writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ changelog }));
			expect(releaseDateEnabled(dir)).toBe(false);
			write("@changesets/cli/changelog");
			expect(releaseDateEnabled(dir)).toBe(false);
			write([CUSTOM_CHANGELOG, {}]);
			expect(releaseDateEnabled(dir)).toBe(false);
			write([CUSTOM_CHANGELOG, { releaseDate: true }]);
			expect(releaseDateEnabled(dir)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("'init --changelog --date' turns it on", async () => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			await runRelease(ctx(dir), ["init", "--changelog", "--date"]);
			expect(releaseDateEnabled(dir)).toBe(true);
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each([
		[["version"], true],
		[["version", "--snapshot", "canary"], false],
		[["version", "--snapshot=canary"], false],
	])("'%j' stamps bumped packages: %s", async (args, expected) => {
		const dir = tmp();
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pkg", version: "1.0.0" }));
			mkdirSync(join(dir, ".changeset"));
			writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ changelog: [CUSTOM_CHANGELOG, { releaseDate: true }] }));
			// Stand in for `changeset version`: bump the package and write its changelog.
			spawnBehavior = {
				code: 0,
				effect: () => {
					writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pkg", version: "1.1.0" }));
					writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG);
				},
			};
			expect(await runRelease(ctx(dir), args)).toBe(0);
			expect(spawnCalls[0]?.args.slice(1)).toEqual(args);
			expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8").includes("📅 _Released ")).toBe(expected);
		} finally {
			log.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("release dates around `changeset version`", () => {
	const CHANGELOG = "# pkg\n\n## 1.1.0\n\n- New thing.\n";
	const git = (dir: string, ...args: string[]) => actualChildProcess.execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

	/** A single-package repo with release dates on. */
	function repo(): string {
		const dir = tmp();
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pkg", version: "1.0.0" }));
		mkdirSync(join(dir, ".changeset"));
		writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ changelog: [CUSTOM_CHANGELOG, { releaseDate: true }] }));
		return dir;
	}

	/** Stand in for `changeset version`: bump the package and write its changelog. */
	function bump(dir: string, code = 0, then?: () => void): void {
		spawnBehavior = {
			code,
			effect: () => {
				writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pkg", version: "1.1.0" }));
				writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG);
				then?.();
			},
		};
	}

	let log: ReturnType<typeof jest.spyOn>;
	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => log.mockRestore());

	it("adds no dates when `changeset version` fails", async () => {
		const dir = repo();
		try {
			bump(dir, 1);
			expect(await runRelease(ctx(dir), ["version"])).toBe(1);
			expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).not.toContain("_Released");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("folds the dates into the commit changesets makes with `commit: true`", async () => {
		const dir = repo();
		try {
			git(dir, "init", "-q");
			git(dir, "config", "user.name", "t");
			git(dir, "config", "user.email", "t@t");
			git(dir, "commit", "-q", "--allow-empty", "-m", "start");
			// Stand in for changesets committing the version bump itself.
			bump(dir, 0, () => {
				git(dir, "add", "-A");
				git(dir, "commit", "-q", "-m", "version");
			});
			expect(await runRelease(ctx(dir), ["version"])).toBe(0);
			expect(git(dir, "status", "--porcelain")).toBe("");
			expect(git(dir, "log", "--format=%s")).toBe("version\nstart");
			expect(git(dir, "show", "HEAD:CHANGELOG.md")).toContain("📅 _Released ");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("leaves the dates uncommitted when changesets doesn't commit", async () => {
		const dir = repo();
		try {
			git(dir, "init", "-q");
			git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "start");
			bump(dir);
			await runRelease(ctx(dir), ["version"]);
			expect(git(dir, "log", "--format=%s")).toBe("start");
			expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toContain("📅 _Released ");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("finds packages in nested workspace folders", async () => {
		const dir = tmp();
		try {
			writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "root", private: true, workspaces: ["packages/*", "packages/tools/*"] }));
			const pkgs = { a: join(dir, "packages", "a"), b: join(dir, "packages", "tools", "b") };
			for (const [name, pkgDir] of Object.entries(pkgs)) {
				mkdirSync(pkgDir, { recursive: true });
				writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
			}
			mkdirSync(join(dir, ".changeset"));
			writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ changelog: [CUSTOM_CHANGELOG, { releaseDate: true }] }));
			spawnBehavior = {
				code: 0,
				effect: () => {
					// Only the nested package is bumped.
					writeFileSync(join(pkgs.b, "package.json"), JSON.stringify({ name: "b", version: "1.1.0" }));
					writeFileSync(join(pkgs.b, "CHANGELOG.md"), CHANGELOG);
					writeFileSync(join(pkgs.a, "CHANGELOG.md"), "# a\n\n## 1.0.0\n\n- Old.\n");
				},
			};
			await runRelease(ctx(dir), ["version"]);
			expect(readFileSync(join(pkgs.b, "CHANGELOG.md"), "utf8")).toContain("📅 _Released ");
			expect(readFileSync(join(pkgs.a, "CHANGELOG.md"), "utf8")).not.toContain("_Released");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
