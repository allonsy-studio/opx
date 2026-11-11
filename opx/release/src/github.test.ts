import { jest } from "@jest/globals";

import { githubClient } from "./github.js";

/** A fetch that answers with `status` and `body`, and records its calls. */
function fakeFetch(status: number, body: unknown) {
	return jest.fn<typeof fetch>(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

const release = { tag: "v1.0.0", name: "v1.0.0", body: "- Notes.", prerelease: false };

describe("githubClient", () => {
	it("lists released tags with GitHub's headers", async () => {
		const fetch = fakeFetch(200, [{ tag_name: "v1.0.0" }, { tag_name: "v0.9.0" }]);
		const client = githubClient({ token: "t", repo: "o/r", apiUrl: "https://api.test", fetch });
		expect(await client.releasedTags()).toEqual(new Set(["v1.0.0", "v0.9.0"]));
		const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.test/repos/o/r/releases?per_page=100");
		expect(init.headers).toMatchObject({ Authorization: "Bearer t", Accept: "application/vnd.github+json" });
	});

	it("creates a release and marks prereleases as not latest", async () => {
		const fetch = fakeFetch(201, { html_url: "https://github.com/o/r/releases/tag/v2.0.0-beta.1" });
		const client = githubClient({ token: "t", repo: "o/r", apiUrl: "https://api.test", fetch });
		expect(await client.createRelease({ ...release, tag: "v2.0.0-beta.1", name: "v2.0.0-beta.1", prerelease: true })).toEqual({ status: "created", url: "https://github.com/o/r/releases/tag/v2.0.0-beta.1" });
		const sent = JSON.parse(String((fetch.mock.calls[0] as [string, RequestInit])[1].body)) as Record<string, unknown>;
		expect(sent).toEqual({ tag_name: "v2.0.0-beta.1", name: "v2.0.0-beta.1", body: "- Notes.", prerelease: true, make_latest: "false" });
	});

	it("treats a release that already exists as done", async () => {
		const fetch = fakeFetch(422, { message: "Validation Failed", errors: [{ code: "already_exists", field: "tag_name" }] });
		const client = githubClient({ token: "t", repo: "o/r", fetch });
		expect(await client.createRelease(release)).toEqual({ status: "exists" });
	});

	it("reports GitHub's message when a call fails", async () => {
		const client = githubClient({ token: "t", repo: "o/r", fetch: fakeFetch(403, { message: "Resource not accessible by integration" }) });
		await expect(client.createRelease(release)).rejects.toThrow("Creating the v1.0.0 release failed: 403 Resource not accessible by integration");
		await expect(githubClient({ token: "t", repo: "o/r", fetch: fakeFetch(500, "oops") }).releasedTags()).rejects.toThrow("Listing GitHub releases failed: 500 oops");
	});
});
