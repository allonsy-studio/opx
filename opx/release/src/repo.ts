import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read `owner/repo` from the root `package.json` `repository` field.
 * @returns The GitHub slug, or `undefined` when it isn't a GitHub repository.
 */
export function detectRepo(cwd: string): string | undefined {
	try {
		const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { repository?: string | { url?: string } };
		const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
		if (!raw) return undefined;
		const url = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(raw);
		if (url?.[1]) return url[1];
		const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw);
		return short?.[1];
	} catch {
		return undefined;
	}
}
