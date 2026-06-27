import { jest } from "@jest/globals";

const links = {
	commit: "[`abc1234`](https://github.com/o/r/commit/abc)",
	pull: "[#1](https://github.com/o/r/pull/1)",
	user: "[@u](https://github.com/u)",
};

const getInfo = jest.fn(async () => ({ links: { ...links } }));
const getInfoFromPullRequest = jest.fn(async () => ({ links: { ...links } }));

jest.unstable_mockModule("dotenv", () => ({
	__esModule: true,
	config: () => ({}),
}));

jest.unstable_mockModule("@changesets/get-github-info", () => ({
	__esModule: true,
	getInfo,
	getInfoFromPullRequest,
}));

const changelog = (await import("./custom-changelog.js")).default;

type ReleaseArgs = Parameters<typeof changelog.getReleaseLine>;
type DepArgs = Parameters<typeof changelog.getDependencyReleaseLine>;

const opts = { repo: "o/r" } as ReleaseArgs[2];

function cs(summary: string, extra: Record<string, unknown> = {}): ReleaseArgs[0] {
	return { summary, commit: undefined, id: "id-1", releases: [], ...extra } as unknown as ReleaseArgs[0];
}

describe("getReleaseLine", () => {
	it("throws when options is missing", async () => {
		await expect(changelog.getReleaseLine(cs("hi"), "patch", null)).rejects.toThrow(/provide a repo/);
	});

	it("throws when options.repo is missing", async () => {
		await expect(changelog.getReleaseLine(cs("hi"), "patch", {} as ReleaseArgs[2])).rejects.toThrow(/provide a repo/);
	});

	it("renders a plain summary with no metadata (no fetch)", async () => {
		const out = await changelog.getReleaseLine(cs("just a change"), "patch", opts);
		expect(out).toContain("just a change");
		expect(out).not.toContain("📝");
	});

	it("extracts a PR number from the summary and fetches via PR", async () => {
		const out = await changelog.getReleaseLine(cs("pr: 123\nfixed a thing"), "patch", opts);
		expect(getInfoFromPullRequest).toHaveBeenCalledWith({ repo: "o/r", pull: 123 });
		expect(out).toContain("📝");
		expect(out).toContain("fixed a thing");
	});

	it("supports the 'pull request: #123' form and a commit override", async () => {
		const out = await changelog.getReleaseLine(cs("pull request: #7\ncommit: deadbeefcafe\nthing"), "patch", opts);
		expect(getInfoFromPullRequest).toHaveBeenCalledWith({ repo: "o/r", pull: 7 });
		expect(out).toContain("deadbee");
	});

	it("uses the commit line when no PR is given", async () => {
		const out = await changelog.getReleaseLine(cs("commit: abcdef0\nthing"), "patch", opts);
		expect(getInfo).toHaveBeenCalledWith({ repo: "o/r", commit: "abcdef0" });
		expect(out).toContain("thing");
	});

	it("falls back to changeset.commit when summary has no commit", async () => {
		const out = await changelog.getReleaseLine(cs("thing", { commit: "feedface" }), "patch", opts);
		expect(getInfo).toHaveBeenCalledWith({ repo: "o/r", commit: "feedface" });
		expect(out).toContain("thing");
	});

	it("collects author/user lines from the summary", async () => {
		const out = await changelog.getReleaseLine(cs("author: @alice\nuser: bob\nthing"), "patch", opts);
		expect(out).toContain("Thanks");
		expect(out).toContain("alice");
		expect(out).toContain("bob");
	});
});

describe("getDependencyReleaseLine", () => {
	it("throws when options.repo is missing", async () => {
		await expect(changelog.getDependencyReleaseLine([], [], {} as DepArgs[2])).rejects.toThrow(/provide a repo/);
	});

	it("returns an empty string when no dependencies updated", async () => {
		expect(await changelog.getDependencyReleaseLine([cs("x")], [], opts)).toBe("");
	});

	it("builds an updated-dependencies block with commit links", async () => {
		const deps = [{ name: "pkg-a", newVersion: "1.2.3" }] as DepArgs[1];
		const out = await changelog.getDependencyReleaseLine([cs("x", { commit: "abc123" }), cs("y")], deps, opts);
		expect(getInfo).toHaveBeenCalledWith({ repo: "o/r", commit: "abc123" });
		expect(out).toContain("Updated dependencies");
		expect(out).toContain("pkg-a@1.2.3");
	});
});
