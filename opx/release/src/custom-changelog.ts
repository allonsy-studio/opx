import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getInfo, getInfoFromPullRequest } from "@changesets/get-github-info";
import type { ChangelogFunctions } from "@changesets/types";

import { loadLocalEnv } from "./env.js";

loadLocalEnv();

/** Options read from the second item of `changelog` in `.changeset/config.json`. */
export type ChangelogOptions = {
	/** `owner/repo`. Falls back to `GITHUB_REPOSITORY`. */
	repo?: string;
	/** Handles never thanked (case-insensitive). Defaults to the root package's `author` and `contributors`. */
	maintainers?: string[];
	/** Drop the thanks suffix for everyone. */
	disableThanks?: boolean;
	/** Add a `📅 _Released 8 November 2026_` line under each new version heading; `opx release version` writes it. */
	releaseDate?: boolean;
};

type Meta = { cleaned: string; pr?: number; commit?: string; authors: string[]; migration?: string };
type Author = { login: string; link: string };

const serverUrl = (): string => process.env.GITHUB_SERVER_URL || "https://github.com";

/** A `package.json` person: `"Name <email> (url)"` or `{ name, email, url }`. */
export type Person = string | { name?: string; email?: string; url?: string };

/** Read the GitHub handle from a noreply email or a github.com profile URL. */
export function githubHandle(person: Person): string | undefined {
	const email = typeof person === "string" ? /<([^>]+)>/.exec(person)?.[1] : person.email;
	const url = typeof person === "string" ? /\(([^)]+)\)/.exec(person)?.[1] : person.url;
	const fromEmail = email && /^(?:\d+\+)?([\w-]+)@users\.noreply\.github\.com$/i.exec(email.trim())?.[1];
	if (fromEmail) return fromEmail;
	return (url && /^https?:\/\/(?:www\.)?github\.com\/([\w-]+)\/?$/i.exec(url.trim())?.[1]) || undefined;
}

/** Read a JSON file, or `undefined` when it is missing or invalid. */
function readJson(file: string): Record<string, unknown> | undefined {
	try {
		return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

/**
 * Find the workspace root's `package.json` from any `package.json` inside it.
 * Walks up to the top-most folder that declares workspaces, stopping at the git root.
 * @param file - A `package.json` path, such as a workspace's own.
 */
export function workspaceRootPackageJson(file: string): string {
	let root = file;
	let dir = dirname(file);
	while (!existsSync(join(dir, ".git"))) {
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
		const candidate = join(dir, "package.json");
		if (readJson(candidate)?.workspaces || existsSync(join(dir, "pnpm-workspace.yaml"))) root = candidate;
	}
	return root;
}

const maintainerCache = new Map<string, string[]>();

/**
 * Handles from the workspace root's `package.json` `author` and `contributors`. Cached per file.
 * @param file - Defaults to `npm_package_json`, set by npm and Yarn scripts, then `./package.json`.
 */
export function packageMaintainers(file = process.env.npm_package_json || join(process.cwd(), "package.json")): string[] {
	const root = workspaceRootPackageJson(file);
	const cached = maintainerCache.get(root);
	if (cached) return cached;
	const pkg = readJson(root) as { author?: Person; contributors?: Person[] } | undefined;
	const people = [pkg?.author, ...(Array.isArray(pkg?.contributors) ? pkg.contributors : [])].filter((p): p is Person => Boolean(p));
	const handles = [...new Set(people.map(githubHandle).filter((h): h is string => Boolean(h)))];
	maintainerCache.set(root, handles);
	return handles;
}

/** Whether a GitHub author is an app or bot, such as Renovate or Dependabot. */
export function isBot(author: { login: string; link: string }): boolean {
	return /\[bot\]$/i.test(author.login) || author.link.includes("/apps/");
}

/**
 * Resolve the `owner/repo` the links point at.
 * @throws When neither the option nor `GITHUB_REPOSITORY` is set.
 */
export function requireRepo(options: ChangelogOptions | null | undefined): string {
	const repo = options?.repo || process.env.GITHUB_REPOSITORY;
	if (!repo) {
		throw new Error(
			"Please provide a repo to the changelog generator in .changeset/config.json:\n" +
				'"changelog": ["@allons-y/opx-release/changelog", { "repo": "org/repo" }]',
		);
	}
	return repo;
}

/** Link bare `#123` references. Inline code, markdown links, autolinks, and URLs are left alone. */
export function linkifyIssueRefs(line: string, repo: string): string {
	return line.replace(/(`+)[^`]*?\1|\[[^\]]*\]\([^)]*\)|<[^>\s]+>|https?:\/\/[^\s)>]+|\B#([1-9]\d*)\b/g, (match, _ticks, issue: string | undefined) =>
		issue ? `[#${issue}](${serverUrl()}/${repo}/issues/${issue})` : match,
	);
}

/**
 * Mark which lines belong to fenced code, fences included.
 * A fence closes only with the same character, at least as long, and no info string.
 */
export function codeLines(lines: string[]): boolean[] {
	let fence: string | undefined;
	return lines.map((line) => {
		const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
		if (!match) return Boolean(fence);
		const [, marker = "", rest = ""] = match;
		if (!fence) {
			fence = marker;
			return true;
		}
		if (marker[0] === fence[0] && marker.length >= fence.length && !rest.trim()) fence = undefined;
		return true;
	});
}

/**
 * Pull `pr:`, `commit:`, `author:`, and `migration:` lines out of a summary. Lines inside fenced code are never read as metadata.
 * `migration:` (or `upgrade:`) starts the upgrade note, which runs to the end of the summary.
 */
export function extractMeta(summary: string): Meta {
	let pr: number | undefined;
	let commit: string | undefined;
	const authors: string[] = [];
	const kept: string[] = [];
	let migration: string[] | undefined;
	const lines = summary.split(/\r?\n/);
	const inCode = codeLines(lines);
	lines.forEach((line, i) => {
		if (!inCode[i]) {
			let match: RegExpExecArray | null;
			if (pr === undefined && (match = /^[ \t]*(?:pr|pull|pull\s+request):\s*#?(\d+)[ \t]*$/i.exec(line))) return void (pr = Number(match[1]));
			if (commit === undefined && (match = /^[ \t]*commit:\s*(\S+)[ \t]*$/i.exec(line))) return void (commit = match[1]);
			if ((match = /^[ \t]*(?:author|user):\s*@?(\S+)[ \t]*$/i.exec(line))) return void authors.push(match[1] as string);
			if (!migration && (match = /^[ \t]*(?:migration|upgrade):[ \t]*(.*)$/i.exec(line))) return void (migration = [match[1] ?? ""]);
		}
		(migration ?? kept).push(line);
	});
	const note = migration?.join("\n").trim();
	return { cleaned: kept.join("\n").trim(), pr, commit, authors, ...(note ? { migration: note } : {}) };
}

/**
 * Indent lines so they stay inside a list item. Fenced code is indented but never linkified.
 * @param lines - Lines after the entry's headline.
 */
export function renderBody(lines: string[], repo: string): string[] {
	const inCode = codeLines(lines);
	return lines.map((line, i) => {
		if (inCode[i]) return `  ${line}`;
		return line ? `  ${linkifyIssueRefs(line, repo)}` : "";
	});
}

/** Link to the GitHub diff between two tagged versions of a package. */
export function compareUrl(repo: string, name: string, from: string, to: string): string {
	return `${serverUrl()}/${repo}/compare/${name}@${from}...${name}@${to}`;
}

/** Look up the PR-or-commit link and the authors; calls GitHub only when there is something to look up. */
async function resolveLinks(repo: string, meta: Meta, changesetCommit: string | undefined): Promise<{ reference: string | null; authors: Author[] }> {
	let info: { user: string | null; links: { pull: string | null; commit: string | null; user: string | null } } = {
		user: null,
		links: { pull: null, commit: null, user: null },
	};
	if (meta.pr !== undefined) {
		info = await getInfoFromPullRequest({ repo, pull: meta.pr });
	} else {
		const commit = meta.commit || changesetCommit;
		if (commit) info = await getInfo({ repo, commit });
	}
	let { links } = info;
	if (meta.commit) {
		links = { ...links, commit: `[\`${meta.commit.slice(0, 7)}\`](${serverUrl()}/${repo}/commit/${meta.commit})` };
	}
	const authors: Author[] = meta.authors.length
		? meta.authors.map((login) => ({ login, link: `[@${login}](${serverUrl()}/${login})` }))
		: info.user && links.user
			? [{ login: info.user, link: links.user }]
			: [];
	return { reference: links.pull || links.commit, authors };
}

/**
 * A changelog generator whose entries read cleanly as plain text and in print, and render cleanly as Markdown:
 * `- Summary headline. (📝 [#12](…)) — thanks [@user](…)!`
 *
 * Thanks only authors outside `maintainers`. Needs `GITHUB_TOKEN` at version time.
 */
const changelogFunctions: ChangelogFunctions = {
	getReleaseLine: async (changeset, _type, rawOptions) => {
		const options = (rawOptions ?? {}) as ChangelogOptions;
		const repo = requireRepo(options);
		const meta = extractMeta(changeset.summary);
		const { reference, authors } = await resolveLinks(repo, meta, changeset.commit);

		const lines = meta.cleaned.split("\n").map((line) => line.trimEnd());
		let [headline = "", ...rest] = lines;
		// Keep code, or an empty summary, out of the bullet line.
		if (!headline || codeLines([headline])[0]) {
			console.warn(`opx: changeset "${changeset.id}" has no summary line; its changelog entry says "No summary."`);
			rest = headline ? ["", ...lines] : [];
			headline = "_No summary._";
		}

		const maintainers = new Set((options.maintainers ?? packageMaintainers()).map((handle) => handle.toLowerCase()));
		const external = authors.filter((author) => !isBot(author) && !maintainers.has(author.login.toLowerCase()));

		let suffix = "";
		if (reference) suffix += ` (📝 ${reference})`;
		if (external.length && !options.disableThanks) suffix += ` — thanks ${external.map((a) => a.link).join(", ")}!`;

		const body = renderBody(rest, repo);
		if (meta.migration) {
			const [first = "", ...more] = meta.migration.split("\n").map((line) => line.trimEnd());
			body.push("", `  **To upgrade:**${first ? ` ${linkifyIssueRefs(first, repo)}` : ""}`, ...renderBody(more, repo));
		}

		return [`- ${linkifyIssueRefs(headline, repo)}${suffix}`, ...body].join("\n").trimEnd();
	},

	getDependencyReleaseLine: async (_changesets, dependenciesUpdated, rawOptions) => {
		const repo = requireRepo(rawOptions as ChangelogOptions | null);
		if (dependenciesUpdated.length === 0) return "";
		const items = dependenciesUpdated.map((dep) => {
			const range = dep.oldVersion && dep.oldVersion !== dep.newVersion ? `${dep.oldVersion} → ${dep.newVersion}` : dep.newVersion;
			// Private packages are never tagged, so there is no diff to link.
			const diff = dep.oldVersion && dep.oldVersion !== dep.newVersion && !dep.packageJson?.private ? ` ([diff](${compareUrl(repo, dep.name, dep.oldVersion, dep.newVersion)}))` : "";
			return `\`${dep.name}\` ${range}${diff}`;
		});
		if (items.length === 1) return `- Updated ${items[0]}`;
		return ["- Updated dependencies:", ...items.map((item) => `  - ${item}`)].join("\n");
	},
};

export default changelogFunctions;
