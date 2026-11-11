/** A GitHub release to create. */
export type NewRelease = { tag: string; name: string; body: string; prerelease: boolean };

/** What creating a release did. */
export type CreateResult = { status: "created"; url: string } | { status: "exists" };

/** The few GitHub REST calls the release flow needs. */
export type GitHubClient = {
	/** Tags that already have a release (the newest 100). */
	releasedTags(): Promise<Set<string>>;
	/** Create a release, or report that one already exists for the tag. */
	createRelease(release: NewRelease): Promise<CreateResult>;
};

type Fetch = typeof fetch;

/**
 * A client for one repository's releases.
 * @param options.repo - `owner/repo`.
 * @param options.apiUrl - Defaults to `GITHUB_API_URL`, then `https://api.github.com`.
 */
export function githubClient(options: { token: string; repo: string; apiUrl?: string; fetch?: Fetch }): GitHubClient {
	const fetcher = options.fetch ?? fetch;
	const base = `${options.apiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${options.repo}/releases`;
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
		"User-Agent": "opx-release",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	/** Turn a failed response into an error that says what GitHub said. */
	async function failure(response: Response, action: string): Promise<Error> {
		const text = await response.text().catch(() => "");
		let message = text;
		try {
			message = (JSON.parse(text) as { message?: string }).message ?? text;
		} catch {
			// Not JSON; keep the raw text.
		}
		return new Error(`${action} failed: ${response.status} ${message}`.trim());
	}

	return {
		async releasedTags() {
			const response = await fetcher(`${base}?per_page=100`, { headers });
			if (!response.ok) throw await failure(response, "Listing GitHub releases");
			const releases = (await response.json()) as Array<{ tag_name: string }>;
			return new Set(releases.map((release) => release.tag_name));
		},
		async createRelease(release) {
			const response = await fetcher(base, {
				method: "POST",
				headers: { ...headers, "Content-Type": "application/json" },
				body: JSON.stringify({
					tag_name: release.tag,
					name: release.name,
					body: release.body,
					prerelease: release.prerelease,
					make_latest: release.prerelease ? "false" : "true",
				}),
			});
			// 422 with `already_exists` means another run made it first.
			if (response.status === 422) {
				const text = await response.clone().text();
				if (text.includes("already_exists")) return { status: "exists" };
			}
			if (!response.ok) throw await failure(response, `Creating the ${release.tag} release`);
			const created = (await response.json()) as { html_url: string };
			return { status: "created", url: created.html_url };
		},
	};
}
