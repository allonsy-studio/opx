import { jest } from "@jest/globals";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const links = {
	commit: "[`abc1234`](https://github.com/o/r/commit/abc)",
	pull: "[#1](https://github.com/o/r/pull/1)",
	user: "[@u](https://github.com/u)",
};

const getInfo = jest.fn(async () => ({ user: "u", links: { ...links } }));
const getInfoFromPullRequest = jest.fn(async () => ({ user: "u", links: { ...links } }));

jest.unstable_mockModule("@changesets/get-github-info", () => ({
	__esModule: true,
	getInfo,
	getInfoFromPullRequest,
}));

const mod = await import("./custom-changelog.js");
const changelog = mod.default;

type ReleaseArgs = Parameters<typeof changelog.getReleaseLine>;
type DepArgs = Parameters<typeof changelog.getDependencyReleaseLine>;

const opts = { repo: "o/r" } as ReleaseArgs[2];

function cs(summary: string, extra: Record<string, unknown> = {}): ReleaseArgs[0] {
	return { summary, commit: undefined, id: "id-1", releases: [], ...extra } as unknown as ReleaseArgs[0];
}

const saved = { repo: process.env.GITHUB_REPOSITORY, pkg: process.env.npm_package_json };
const fixtures = mkdtempSync(join(tmpdir(), "opx-changelog-"));

/** Write a package.json fixture and return its path. */
function pkgJson(name: string, data: Record<string, unknown>): string {
	const file = join(fixtures, `${name}.json`);
	writeFileSync(file, JSON.stringify(data));
	return file;
}

const emptyPkg = pkgJson("empty", {});

beforeEach(() => {
	getInfo.mockClear();
	getInfoFromPullRequest.mockClear();
	delete process.env.GITHUB_REPOSITORY;
	process.env.npm_package_json = emptyPkg;
});

afterAll(() => {
	for (const [key, value] of [["GITHUB_REPOSITORY", saved.repo], ["npm_package_json", saved.pkg]] as const) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(fixtures, { recursive: true, force: true });
});

describe("githubHandle", () => {
	it.each([
		["Ada <1840295+ada@users.noreply.github.com> (https://example.com)", "ada"],
		["Ada <ada@users.noreply.github.com>", "ada"],
		["Ada <ada@example.com> (https://github.com/ada-l)", "ada-l"],
		[{ name: "Ada", email: "7+ada@users.noreply.github.com" }, "ada"],
		[{ name: "Ada", url: "https://github.com/ada/" }, "ada"],
		["Ada <ada@example.com> (https://example.com)", undefined],
		["Ada", undefined],
	])("reads %j", (person, expected) => {
		expect(mod.githubHandle(person)).toBe(expected);
	});
});

describe("packageMaintainers", () => {
	it("collects author and contributors, without duplicates", () => {
		const file = pkgJson("people", {
			author: "Ada <1+ada@users.noreply.github.com>",
			contributors: [{ name: "Grace", url: "https://github.com/grace" }, "Ada (https://github.com/ada)", "No Handle <x@example.com>"],
		});
		expect(mod.packageMaintainers(file)).toEqual(["ada", "grace"]);
	});

	it("reads npm_package_json by default", () => {
		process.env.npm_package_json = pkgJson("env", { author: "Ada <ada@users.noreply.github.com>" });
		expect(mod.packageMaintainers()).toEqual(["ada"]);
	});

	it("returns nothing for a missing file", () => {
		expect(mod.packageMaintainers(join(fixtures, "missing.json"))).toEqual([]);
	});
});

describe("requireRepo", () => {
	it("throws when no repo is configured", () => {
		expect(() => mod.requireRepo(null)).toThrow(/provide a repo/);
	});

	it("falls back to GITHUB_REPOSITORY", () => {
		process.env.GITHUB_REPOSITORY = "env/repo";
		expect(mod.requireRepo(null)).toBe("env/repo");
	});

	it("prefers the configured repo", () => {
		process.env.GITHUB_REPOSITORY = "env/repo";
		expect(mod.requireRepo({ repo: "o/r" })).toBe("o/r");
	});
});

describe("extractMeta", () => {
	it("pulls pr, commit, and author lines out of the summary", () => {
		const meta = mod.extractMeta("pr: #7\ncommit: deadbeef\nauthor: @alice\nuser: bob\nThe change.");
		expect(meta).toEqual({ cleaned: "The change.", pr: 7, commit: "deadbeef", authors: ["alice", "bob"] });
	});

	it("leaves prose that only mentions the keywords alone", () => {
		expect(mod.extractMeta("Fix the commit: parser").cleaned).toBe("Fix the commit: parser");
	});
});

describe("linkifyIssueRefs", () => {
	it("links bare refs and keeps existing links", () => {
		expect(mod.linkifyIssueRefs("See #12 and [#3](x)", "o/r")).toBe("See [#12](https://github.com/o/r/issues/12) and [#3](x)");
	});
});

describe("getReleaseLine", () => {
	it("throws when no repo is configured", async () => {
		await expect(changelog.getReleaseLine(cs("hi"), "patch", null)).rejects.toThrow(/provide a repo/);
	});

	it("renders a plain summary with no lookup", async () => {
		const out = await changelog.getReleaseLine(cs("just a change"), "patch", opts);
		expect(out).toBe("- just a change");
		expect(getInfo).not.toHaveBeenCalled();
	});

	it("puts the PR link after the headline and thanks the author", async () => {
		const out = await changelog.getReleaseLine(cs("pr: 123\nFixed a thing."), "patch", opts);
		expect(getInfoFromPullRequest).toHaveBeenCalledWith({ repo: "o/r", pull: 123 });
		expect(out).toBe(`- Fixed a thing. (📝 ${links.pull}) — thanks ${links.user}!`);
	});

	it("does not thank maintainers (case-insensitive)", async () => {
		const out = await changelog.getReleaseLine(cs("pr: 1\nThing."), "patch", { repo: "o/r", maintainers: ["U"] } as ReleaseArgs[2]);
		expect(out).toBe(`- Thing. (📝 ${links.pull})`);
	});

	it("drops thanks entirely with disableThanks", async () => {
		const out = await changelog.getReleaseLine(cs("pr: 1\nThing."), "patch", { repo: "o/r", disableThanks: true } as ReleaseArgs[2]);
		expect(out).not.toContain("thanks");
	});

	it("uses a commit override link and falls back to the commit when there is no PR", async () => {
		getInfo.mockResolvedValueOnce({ user: "u", links: { ...links, pull: null } } as never);
		const out = await changelog.getReleaseLine(cs("commit: deadbeefcafe\nThing."), "patch", opts);
		expect(getInfo).toHaveBeenCalledWith({ repo: "o/r", commit: "deadbeefcafe" });
		expect(out).toContain("[`deadbee`](https://github.com/o/r/commit/deadbeefcafe)");
	});

	it("falls back to changeset.commit", async () => {
		await changelog.getReleaseLine(cs("Thing.", { commit: "feedface" }), "patch", opts);
		expect(getInfo).toHaveBeenCalledWith({ repo: "o/r", commit: "feedface" });
	});

	it("thanks only external authors from author overrides", async () => {
		const out = await changelog.getReleaseLine(cs("author: @ada\nauthor: @alice\nThing."), "patch", { repo: "o/r", maintainers: ["ada"] } as ReleaseArgs[2]);
		expect(out).toContain("thanks [@alice](https://github.com/alice)!");
		expect(out).not.toContain("@ada");
	});

	it("defaults maintainers to the package author and contributors", async () => {
		process.env.npm_package_json = pkgJson("default", { author: "U <9+u@users.noreply.github.com>" });
		const out = await changelog.getReleaseLine(cs("pr: 1\nThing."), "patch", opts);
		expect(out).toBe(`- Thing. (📝 ${links.pull})`);
	});

	it("lets an explicit maintainers list win over the package", async () => {
		process.env.npm_package_json = pkgJson("override", { author: "U <u@users.noreply.github.com>" });
		const out = await changelog.getReleaseLine(cs("pr: 1\nThing."), "patch", { repo: "o/r", maintainers: [] } as ReleaseArgs[2]);
		expect(out).toContain("thanks");
	});

	it("indents continuation lines and keeps blank lines", async () => {
		const out = await changelog.getReleaseLine(cs("Headline.\n\nMore about #4."), "patch", opts);
		expect(out).toBe("- Headline.\n\n  More about [#4](https://github.com/o/r/issues/4).");
	});
});

describe("upgrade notes and code", () => {
	it("pulls a migration block out of the summary", () => {
		const meta = mod.extractMeta("Drop Node 22.\n\nmigration: Upgrade to Node 24.\nThen reinstall.");
		expect(meta.cleaned).toBe("Drop Node 22.");
		expect(meta.migration).toBe("Upgrade to Node 24.\nThen reinstall.");
	});

	it("renders the upgrade note as an indented paragraph", async () => {
		const out = await changelog.getReleaseLine(cs("Drop Node 22.\nupgrade:\nUpgrade to Node 24, see #9."), "major", opts);
		expect(out).toBe("- Drop Node 22.\n\n  **To upgrade:** Upgrade to Node 24, see [#9](https://github.com/o/r/issues/9).");
	});

	it("keeps fenced code inside the list item and never links refs in it", async () => {
		const out = await changelog.getReleaseLine(cs("Add a flag.\n\n```sh\nopx run #1\n\necho done\n```\n\nSee #2."), "minor", opts);
		expect(out).toBe(
			["- Add a flag.", "", "  ```sh", "  opx run #1", "  ", "  echo done", "  ```", "", "  See [#2](https://github.com/o/r/issues/2)."].join("\n"),
		);
	});

	it("keeps emoji in summaries", async () => {
		expect(await changelog.getReleaseLine(cs("✨ Sparkly new output."), "minor", opts)).toBe("- ✨ Sparkly new output.");
	});
});

describe("review edge cases", () => {
	it("never reads metadata from fenced code", () => {
		const summary = "Run as a non-root user.\n\n```yaml\nservices:\n  app:\n    user: node\ncommit: false\nupgrade: true\n```\n\nauthor: @alice";
		expect(mod.extractMeta(summary)).toEqual({
			cleaned: "Run as a non-root user.\n\n```yaml\nservices:\n  app:\n    user: node\ncommit: false\nupgrade: true\n```",
			pr: undefined,
			commit: undefined,
			authors: ["alice"],
		});
	});

	it("keeps code inside an upgrade note intact", () => {
		const meta = mod.extractMeta("Rename a key.\nmigration: Change your config:\n\n```yaml\nupgrade: true\n```");
		expect(meta.cleaned).toBe("Rename a key.");
		expect(meta.migration).toBe("Change your config:\n\n```yaml\nupgrade: true\n```");
	});

	it("reads metadata lines after the upgrade note starts", () => {
		const meta = mod.extractMeta("Rename a key.\nmigration: Update it.\npr: 12");
		expect(meta).toMatchObject({ cleaned: "Rename a key.", migration: "Update it.", pr: 12 });
	});

	it.each([
		["`#333`", "`#333`"],
		["``a `#12` b``", "``a `#12` b``"],
		["https://site.dev/#12", "https://site.dev/#12"],
		["<https://site.dev/#12>", "<https://site.dev/#12>"],
		["[see #12](https://x.dev)", "[see #12](https://x.dev)"],
		["Fix #12.", "Fix [#12](https://github.com/o/r/issues/12)."],
		["(#12)", "([#12](https://github.com/o/r/issues/12))"],
	])("linkifies %j as %j", (input, expected) => {
		expect(mod.linkifyIssueRefs(input, "o/r")).toBe(expected);
	});

	it.each([
		[["```", "a", "```", "b"], [true, true, true, false]],
		[["````md", "```js", "x", "```", "````", "y"], [true, true, true, true, true, false]],
		[["~~~", "```", "~~~"], [true, true, true]],
		[["```", "```js", "still code", "```"], [true, true, true, true]],
	])("marks code lines in %j", (lines, expected) => {
		expect(mod.codeLines(lines)).toEqual(expected);
	});

	it.each([
		[{ login: "renovate", link: "[@renovate](https://github.com/apps/renovate)" }, true],
		[{ login: "dependabot[bot]", link: "[@dependabot[bot]](https://github.com/dependabot)" }, true],
		[{ login: "alice", link: "[@alice](https://github.com/alice)" }, false],
	])("isBot(%j) is %s", (author, expected) => {
		expect(mod.isBot(author)).toBe(expected);
	});

	it("never thanks a bot", async () => {
		getInfoFromPullRequest.mockResolvedValueOnce({ user: "renovate", links: { ...links, user: "[@renovate](https://github.com/apps/renovate)" } } as never);
		const out = await changelog.getReleaseLine(cs("pr: 3\nBump a tool."), "patch", opts);
		expect(out).toBe(`- Bump a tool. (📝 ${links.pull})`);
	});

	it("falls back to a placeholder headline for a summary that starts with code", async () => {
		const warn = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			const out = await changelog.getReleaseLine(cs("```js\nx()\n```"), "patch", opts);
			expect(out).toBe("- _No summary._\n\n  ```js\n  x()\n  ```");
			expect(warn).toHaveBeenCalledWith(expect.stringContaining("id-1"));
		} finally {
			warn.mockRestore();
		}
	});

	it("falls back to a placeholder headline for an upgrade note alone", async () => {
		const warn = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			const out = await changelog.getReleaseLine(cs("migration: Reinstall."), "major", opts);
			expect(out).toBe("- _No summary._\n\n  **To upgrade:** Reinstall.");
		} finally {
			warn.mockRestore();
		}
	});
});

describe("nested workspaces", () => {
	/** A root with workspaces, and a workspace nested two levels down. */
	function tree(): { root: string; nested: string } {
		const root = mkdtempSync(join(fixtures, "ws-"));
		mkdirSync(join(root, ".git"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/**"], author: "Ada <1+ada@users.noreply.github.com>" }));
		const nested = join(root, "packages", "group", "a");
		mkdirSync(nested, { recursive: true });
		writeFileSync(join(nested, "package.json"), JSON.stringify({ name: "a", author: "Grace <grace@users.noreply.github.com>" }));
		return { root, nested };
	}

	it("finds the workspace root from a nested workspace", () => {
		const { root, nested } = tree();
		expect(mod.workspaceRootPackageJson(join(nested, "package.json"))).toBe(join(root, "package.json"));
	});

	it("takes maintainers from the root when a script runs inside a workspace", () => {
		const { nested } = tree();
		process.env.npm_package_json = join(nested, "package.json");
		expect(mod.packageMaintainers()).toEqual(["ada"]);
	});

	it("finds a pnpm workspace root", () => {
		const root = mkdtempSync(join(fixtures, "pnpm-"));
		mkdirSync(join(root, ".git"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		writeFileSync(join(root, "package.json"), JSON.stringify({ author: "Ada <ada@users.noreply.github.com>" }));
		mkdirSync(join(root, "packages", "a"), { recursive: true });
		writeFileSync(join(root, "packages", "a", "package.json"), "{}");
		expect(mod.workspaceRootPackageJson(join(root, "packages", "a", "package.json"))).toBe(join(root, "package.json"));
	});

	it("stays put outside a workspace and stops at the git root", () => {
		const root = mkdtempSync(join(fixtures, "solo-"));
		mkdirSync(join(root, ".git"));
		writeFileSync(join(root, "package.json"), "{}");
		expect(mod.workspaceRootPackageJson(join(root, "package.json"))).toBe(join(root, "package.json"));
	});

	it("reads each package.json once", () => {
		const file = pkgJson("cached", { author: "Ada <ada@users.noreply.github.com>" });
		expect(mod.packageMaintainers(file)).toEqual(["ada"]);
		writeFileSync(file, JSON.stringify({ author: "Grace <grace@users.noreply.github.com>" }));
		expect(mod.packageMaintainers(file)).toEqual(["ada"]);
	});
});

describe("getDependencyReleaseLine", () => {
	it("throws when no repo is configured", async () => {
		await expect(changelog.getDependencyReleaseLine([], [], {} as DepArgs[2])).rejects.toThrow(/provide a repo/);
	});

	it("returns an empty string when no dependencies updated", async () => {
		expect(await changelog.getDependencyReleaseLine([cs("x")], [], opts)).toBe("");
	});

	it("puts one dependency on one line, with old → new and a diff link", async () => {
		const deps = [{ name: "@s/a", oldVersion: "1.0.0-beta.1", newVersion: "1.0.0-beta.2", packageJson: {} }] as unknown as DepArgs[1];
		const out = await changelog.getDependencyReleaseLine([cs("x", { commit: "abc123" })], deps, opts);
		expect(out).toBe("- Updated `@s/a` 1.0.0-beta.1 → 1.0.0-beta.2 ([diff](https://github.com/o/r/compare/@s/a@1.0.0-beta.1...@s/a@1.0.0-beta.2))");
		expect(getInfo).not.toHaveBeenCalled();
	});

	it("groups several dependencies under one bullet", async () => {
		const deps = [
			{ name: "a", oldVersion: "1.0.0", newVersion: "1.1.0", packageJson: {} },
			{ name: "b", oldVersion: "2.0.0", newVersion: "2.0.1", packageJson: { private: true } },
			{ name: "c", newVersion: "3.0.0", packageJson: {} },
		] as unknown as DepArgs[1];
		const out = await changelog.getDependencyReleaseLine([], deps, opts);
		expect(out).toBe(
			[
				"- Updated dependencies:",
				"  - `a` 1.0.0 → 1.1.0 ([diff](https://github.com/o/r/compare/a@1.0.0...a@1.1.0))",
				"  - `b` 2.0.0 → 2.0.1",
				"  - `c` 3.0.0",
			].join("\n"),
		);
	});
});
