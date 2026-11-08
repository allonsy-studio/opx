import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

import type { GitHubClient, NewRelease } from "./github.js";
import { changelogSection, githubFromEnv, parsePublishArgs, releaseTargets, resolveSettings, runPublish, type PublishDeps } from "./publish.js";
import { createUi } from "./ui.js";

const scratch = useScratch();

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** Write JSON to a path, creating its folder. */
function json(path: string, data: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, JSON.stringify(data));
}

/**
 * A committed repository with a bare `origin`. `packages` maps a folder (or `.` for a
 * single package) to its package.json.
 */
function repo(packages: Record<string, Record<string, unknown>>, files: Record<string, string> = {}): { dir: string; origin: string } {
	const root = scratch.dir("opx-publish-");
	const dir = join(root, "work");
	const origin = join(root, "origin.git");
	mkdirSync(dir);
	git(root, "init", "-q", "--bare", origin);
	if (!packages["."]) json(join(dir, "package.json"), { name: "root", private: true, workspaces: ["packages/*"] });
	for (const [folder, pkg] of Object.entries(packages)) {
		json(join(dir, folder, "package.json"), pkg);
		writeFileSync(join(dir, folder, "CHANGELOG.md"), `# ${String(pkg.name)}\n\n## ${String(pkg.version)}\n\n### Minor Changes\n\n- Notes for ${String(pkg.name)}.\n\n## 0.0.1\n\n- Old.\n`);
	}
	json(join(dir, ".changeset", "config.json"), { baseBranch: "main" });
	for (const [file, content] of Object.entries(files)) {
		mkdirSync(join(dir, file, ".."), { recursive: true });
		writeFileSync(join(dir, file), content);
	}
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.name", "t");
	git(dir, "config", "user.email", "t@t");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "start");
	git(dir, "remote", "add", "origin", origin);
	git(dir, "push", "-q", "origin", "main");
	return { dir, origin };
}

/** Tags on the bare origin, sorted. */
const originTags = (origin: string) => git(origin, "tag", "--list").split("\n").filter(Boolean).sort();

/** A fake GitHub that records the releases it's asked to create. */
function fakeGithub(existing: string[] = [], fail?: string): GitHubClient & { created: NewRelease[] } {
	const created: NewRelease[] = [];
	return {
		created,
		releasedTags: async () => new Set(existing),
		createRelease: async (release) => {
			if (release.tag === fail) throw new Error("Creating failed: 500 boom");
			created.push(release);
			return { status: "created", url: `https://github.com/o/r/releases/tag/${release.tag}` };
		},
	};
}

/** Deps with a captured ui, a publish step that exits `code`, and the given GitHub. */
function deps(github: GitHubClient | { reason: string }, code = 0): PublishDeps & { out: string[]; err: string[]; published: string[][] } {
	const out: string[] = [];
	const err: string[] = [];
	const published: string[][] = [];
	return {
		out,
		err,
		published,
		ui: createUi({ out: (l) => out.push(l), err: (l) => err.push(l), color: false, unicode: true }),
		publish: async (_cwd, args) => {
			published.push(args);
			return code;
		},
		github: () => github,
	};
}

const MONOREPO = {
	"packages/a": { name: "@s/a", version: "1.2.0" },
	"packages/b": { name: "@s/b", version: "2.0.0-beta.1" },
	"packages/docs": { name: "docs", version: "1.0.0", private: true },
};

describe("githubFromEnv", () => {
	it("needs a token, then a repository from the environment or package.json", () => {
		const dir = scratch.dir("opx-gh-env-");
		expect(githubFromEnv(dir, {})).toEqual({ reason: "set GITHUB_TOKEN to create them" });
		expect(githubFromEnv(dir, { GITHUB_TOKEN: "t" })).toEqual({ reason: "no GitHub repository in package.json or GITHUB_REPOSITORY" });
		expect(githubFromEnv(dir, { GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r" })).toHaveProperty("createRelease");
		json(join(dir, "package.json"), { repository: "github:o/r" });
		expect(githubFromEnv(dir, { GITHUB_TOKEN: "t" })).toHaveProperty("createRelease");
	});
});

describe("parsePublishArgs", () => {
	it("keeps opx's flags and forwards the rest to changesets", () => {
		expect(parsePublishArgs(["--no-push", "--tag", "next", "--no-github-release", "--otp", "1", "--action"])).toEqual({
			push: false,
			githubReleases: false,
			action: true,
			noGitTag: false,
			forwarded: ["--tag", "next", "--otp", "1"],
		});
		expect(parsePublishArgs(["--no-git-tag", "--no-action"])).toMatchObject({ noGitTag: true, action: false, forwarded: ["--no-git-tag"] });
	});
});

describe("resolveSettings", () => {
	it("pushes and creates releases by default, and finds Action repos by action.yml", () => {
		const plain = scratch.dir("opx-settings-");
		expect(resolveSettings(plain, true, {})).toEqual({ push: true, githubReleases: true, action: false });
		writeFileSync(join(plain, "action.yml"), "name: x\n");
		expect(resolveSettings(plain, true, {}).action).toEqual({ dist: "dist", majorTag: true });
	});

	it("lets config turn things off, and flags override config", () => {
		const dir = scratch.dir("opx-settings-");
		const config = { push: false, githubReleases: false, action: { dist: "build", majorTag: false } };
		expect(resolveSettings(dir, config, {})).toEqual({ push: false, githubReleases: false, action: { dist: "build", majorTag: false } });
		expect(resolveSettings(dir, config, { push: true, githubReleases: true, action: false })).toEqual({ push: true, githubReleases: true, action: false });
	});
});

describe("changelogSection", () => {
	const source = "# pkg\n\n## 1.2.0\n\n📅 _Released 8 November 2026_\n\n### Minor Changes\n\n- New.\n\n## 1.1.0\n\n- Old.\n";

	it("returns the notes under the version, including its ### sections", () => {
		expect(changelogSection(source, "1.2.0")).toBe("📅 _Released 8 November 2026_\n\n### Minor Changes\n\n- New.");
	});

	it("returns the last section to the end of the file, and nothing for a missing version", () => {
		expect(changelogSection(source, "1.1.0")).toBe("- Old.");
		expect(changelogSection(source, "9.9.9")).toBe("");
	});
});

describe("releaseTargets", () => {
	it("tags monorepo packages as name@version and skips private ones", async () => {
		const { dir } = repo(MONOREPO);
		expect((await releaseTargets(dir)).map((t) => [t.tag, t.prerelease])).toEqual([
			["@s/a@1.2.0", false],
			["@s/b@2.0.0-beta.1", true],
		]);
	});

	it("tags a single package as v<version>", async () => {
		const { dir } = repo({ ".": { name: "solo", version: "3.1.0" } });
		expect((await releaseTargets(dir)).map((t) => t.tag)).toEqual(["v3.1.0"]);
	});
});

describe("runPublish", () => {
	it("tags, pushes, and creates a release per package, with changelog notes", async () => {
		const { dir, origin } = repo(MONOREPO);
		const github = fakeGithub();
		const d = deps(github);

		expect(await runPublish(dir, ["--tag", "next"], true, d)).toBe(0);
		expect(d.published).toEqual([["--tag", "next"]]);
		expect(originTags(origin)).toEqual(["@s/a@1.2.0", "@s/b@2.0.0-beta.1"]);
		expect(github.created).toEqual([
			{ tag: "@s/a@1.2.0", name: "@s/a@1.2.0", body: "### Minor Changes\n\n- Notes for @s/a.", prerelease: false },
			{ tag: "@s/b@2.0.0-beta.1", name: "@s/b@2.0.0-beta.1", body: "### Minor Changes\n\n- Notes for @s/b.", prerelease: true },
		]);
		expect(d.out).toEqual(
			expect.arrayContaining([
				"  ✔ Tagged 2 versions  @s/a@1.2.0, @s/b@2.0.0-beta.1",
				"  ✔ Pushed 2 tags to origin  @s/a@1.2.0, @s/b@2.0.0-beta.1",
				"  ✔ Created 2 GitHub releases",
				expect.stringMatching(/^ {2}@s\/a +1\.2\.0 +✔ new +✔ https:\/\/github\.com\/o\/r\/releases\/tag\/@s\/a@1\.2\.0$/),
			]),
		);
	});

	it("does nothing twice: a re-run skips tags and releases that exist", async () => {
		const { dir } = repo(MONOREPO);
		await runPublish(dir, [], true, deps(fakeGithub()));
		const again = deps(fakeGithub(["@s/a@1.2.0", "@s/b@2.0.0-beta.1"]));

		expect(await runPublish(dir, [], true, again)).toBe(0);
		expect(again.out).toEqual(expect.arrayContaining(["  – Pushing tags  origin already has them", "  – GitHub releases  every tag already has one"]));
	});

	it("stops before tagging when publishing fails", async () => {
		const { dir, origin } = repo(MONOREPO);
		const d = deps(fakeGithub(), 7);
		expect(await runPublish(dir, [], true, d)).toBe(7);
		expect(git(dir, "tag", "--list")).toBe("");
		expect(originTags(origin)).toEqual([]);
		expect(d.err).toEqual(["  ✖ Publishing failed  changesets exited with 7"]);
	});

	it("publishes only with --no-git-tag", async () => {
		const { dir } = repo(MONOREPO);
		const d = deps(fakeGithub());
		expect(await runPublish(dir, ["--no-git-tag"], true, d)).toBe(0);
		expect(d.published).toEqual([["--no-git-tag"]]);
		expect(git(dir, "tag", "--list")).toBe("");
		expect(d.out).toContain("  – Tags and GitHub releases  --no-git-tag");
	});

	it("explains a skipped release step when there's no token", async () => {
		const { dir, origin } = repo(MONOREPO);
		const d = deps({ reason: "set GITHUB_TOKEN to create them" });
		expect(await runPublish(dir, [], true, d)).toBe(0);
		expect(originTags(origin)).toHaveLength(2);
		expect(d.out).toContain("  – GitHub releases  set GITHUB_TOKEN to create them");
	});

	it("keeps tags local with --no-push, so no release can point at them", async () => {
		const { dir, origin } = repo(MONOREPO);
		const github = fakeGithub();
		const d = deps(github);
		expect(await runPublish(dir, ["--no-push"], true, d)).toBe(0);
		expect(git(dir, "tag", "--list").split("\n")).toHaveLength(2);
		expect(originTags(origin)).toEqual([]);
		expect(github.created).toEqual([]);
		expect(d.out).toContain("  – Pushing tags  push is off");
	});

	it("honors release settings from .opx/config.json", async () => {
		const { dir } = repo(MONOREPO);
		const github = fakeGithub();
		const d = deps(github);
		expect(await runPublish(dir, [], { githubReleases: false }, d)).toBe(0);
		expect(github.created).toEqual([]);
		expect(d.out).toContain("  – GitHub releases  turned off");
	});

	it("exits 1 when a release fails, keeps going for the rest, and says how to finish", async () => {
		const { dir } = repo(MONOREPO);
		const github = fakeGithub([], "@s/a@1.2.0");
		const d = deps(github);
		expect(await runPublish(dir, [], true, d)).toBe(1);
		expect(github.created.map((r) => r.tag)).toEqual(["@s/b@2.0.0-beta.1"]);
		expect(d.err).toContain("  ✖ Couldn't create the @s/a@1.2.0 release  Creating failed: 500 boom");
		expect(d.out).toContain("    Run `opx release publish` again to finish; completed steps are skipped.");
	});

	it("stops after publishing outside a git repository", async () => {
		const dir = scratch.dir("opx-publish-nogit-");
		const d = deps(fakeGithub());
		expect(await runPublish(dir, [], true, d)).toBe(0);
		expect(d.out).toContain("  – Tags and GitHub releases  not a git repository");
	});

	it("exits 1 and makes no releases when the push fails", async () => {
		const { dir } = repo(MONOREPO);
		git(dir, "remote", "set-url", "--push", "origin", join(dir, "missing.git"));
		const github = fakeGithub();
		const d = deps(github);
		expect(await runPublish(dir, [], true, d)).toBe(1);
		expect(d.err[0]).toMatch(/^ {2}✖ Couldn't push tags/);
		expect(github.created).toEqual([]);
	});

	it("still creates releases when listing them fails", async () => {
		const { dir } = repo(MONOREPO);
		const github = { ...fakeGithub(), releasedTags: async () => Promise.reject(new Error("Listing failed: 502")) };
		const d = deps(github);
		expect(await runPublish(dir, [], true, d)).toBe(0);
		expect(d.err).toContain("  ▲ Couldn't list GitHub releases  Listing failed: 502");
		expect(d.out).toContain("  ✔ Created 2 GitHub releases");
	});

	it("skips pushing when there's no origin", async () => {
		const { dir } = repo(MONOREPO);
		git(dir, "remote", "remove", "origin");
		const d = deps(fakeGithub());
		expect(await runPublish(dir, [], true, d)).toBe(0);
		expect(d.out).toContain("  – Pushing tags  no origin remote");
	});
});

describe("runPublish for a GitHub Action", () => {
	/** A single-package Action repo with a gitignored build. */
	function actionRepo(version = "1.4.0"): { dir: string; origin: string } {
		const made = repo({ ".": { name: "my-action", version } }, { "action.yml": "runs:\n  main: dist/index.js\n", ".gitignore": "dist\n" });
		mkdirSync(join(made.dir, "dist"));
		writeFileSync(join(made.dir, "dist", "index.js"), "console.log('built');\n");
		return made;
	}

	it("tags a commit that holds the build, moves the major tag, and leaves the branch alone", async () => {
		const { dir, origin } = actionRepo();
		const head = git(dir, "rev-parse", "HEAD");
		const d = deps(fakeGithub());

		expect(await runPublish(dir, [], true, d)).toBe(0);
		const tagged = git(dir, "rev-parse", "v1.4.0^{commit}");
		expect(git(dir, "rev-parse", "v1^{commit}")).toBe(tagged);
		expect(git(dir, "rev-parse", `${tagged}^`)).toBe(head);
		expect(git(dir, "show", `${tagged}:dist/index.js`)).toBe("console.log('built');");
		expect(git(dir, "log", "-1", "--format=%s", tagged)).toBe("chore(release): v1.4.0");
		expect(git(dir, "rev-parse", "HEAD")).toBe(head);
		expect(git(dir, "status", "--porcelain")).toBe("");
		expect(originTags(origin)).toEqual(["v1", "v1.4.0"]);
		expect(d.out).toContain("  ✔ Moved v1 to v1.4.0");
	});

	it("moves the major tag forward on the next release", async () => {
		const { dir, origin } = actionRepo();
		await runPublish(dir, [], true, deps(fakeGithub()));
		json(join(dir, "package.json"), { name: "my-action", version: "1.5.0" });
		git(dir, "commit", "-qam", "1.5.0");

		expect(await runPublish(dir, [], true, deps(fakeGithub(["v1.4.0"])))).toBe(0);
		expect(git(origin, "rev-parse", "v1^{commit}")).toBe(git(origin, "rev-parse", "v1.5.0^{commit}"));
	});

	it("leaves the major tag alone for a prerelease", async () => {
		const { dir, origin } = actionRepo("2.0.0-beta.1");
		const d = deps(fakeGithub());
		expect(await runPublish(dir, [], true, d)).toBe(0);
		expect(originTags(origin)).toEqual(["v2.0.0-beta.1"]);
		expect(d.out).toContain("  – Left v2 alone  prereleases don't move the major tag");
	});

	it("skips a version origin already has", async () => {
		const { dir } = actionRepo();
		await runPublish(dir, [], true, deps(fakeGithub()));
		const d = deps(fakeGithub(["v1.4.0"]));
		expect(await runPublish(dir, [], true, d)).toBe(0);
		expect(d.out).toContain("  – v1.4.0 is already on origin  the Action build was committed before");
	});

	it("fails clearly without a build", async () => {
		const { dir } = repo({ ".": { name: "my-action", version: "1.0.0" } }, { "action.yml": "x\n" });
		const d = deps(fakeGithub());
		expect(await runPublish(dir, [], true, d)).toBe(1);
		expect(d.err).toEqual(["  ✖ No dist/ to release  build before publishing, or set release.action.dist"]);
	});

	it("refuses a monorepo", async () => {
		const { dir } = repo(MONOREPO);
		const d = deps(fakeGithub());
		expect(await runPublish(dir, ["--action"], true, d)).toBe(1);
		expect(d.err).toEqual(["  ✖ Can't release as a GitHub Action  that needs exactly one package; found 2"]);
	});

	it("commits as the Actions bot when git has no identity, as in a fresh CI checkout", async () => {
		const { dir } = actionRepo();
		git(dir, "config", "--unset", "user.name");
		git(dir, "config", "--unset", "user.email");
		const saved = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM };
		process.env.GIT_CONFIG_GLOBAL = join(dir, "no-global-config");
		process.env.GIT_CONFIG_NOSYSTEM = "1";
		try {
			expect(await runPublish(dir, [], true, deps(fakeGithub()))).toBe(0);
			expect(git(dir, "log", "-1", "--format=%an <%ae>", "v1.4.0")).toBe("github-actions[bot] <41898283+github-actions[bot]@users.noreply.github.com>");
		} finally {
			for (const [key, value] of [["GIT_CONFIG_GLOBAL", saved.global], ["GIT_CONFIG_NOSYSTEM", saved.system]] as const) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	});

	it("can be turned off for a repo that has action.yml", async () => {
		const { dir, origin } = actionRepo();
		expect(await runPublish(dir, ["--no-action"], true, deps(fakeGithub()))).toBe(0);
		expect(originTags(origin)).toEqual(["v1.4.0"]);
		expect(git(dir, "rev-parse", "v1.4.0^{commit}")).toBe(git(dir, "rev-parse", "HEAD"));
	});
});
