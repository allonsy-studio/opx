import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { read as readConfig } from "@changesets/config";
import { shouldSkipPackage } from "@changesets/should-skip-package";
import { getPackages } from "@manypkg/get-packages";

import { runChangeset } from "./changeset-cli.js";
import { git } from "./git.js";
import { githubClient, type GitHubClient } from "./github.js";
import { detectRepo } from "./repo.js";
import { ui as defaultUi, type Ui } from "./ui.js";

/** How a GitHub Action repository is released. */
export type ActionSettings = {
	/** The build output committed onto the release tag. Defaults to `dist`. */
	dist: string;
	/** Move the floating major tag (`v1`) to each stable release. Defaults to `true`. */
	majorTag: boolean;
};

/** The release settings after config, flags, and detection are combined. */
export type ReleaseSettings = {
	/** Push new tags to `origin`. */
	push: boolean;
	/** Create a GitHub release for each new tag. */
	githubReleases: boolean;
	/** Release as a GitHub Action, or `false`. */
	action: ActionSettings | false;
};

/** `opx release publish` flags opx handles, and everything else for changesets. */
export type PublishArgs = {
	push?: boolean;
	githubReleases?: boolean;
	action?: boolean;
	/** Changesets' `--no-git-tag`: publish only. */
	noGitTag: boolean;
	/** Args passed on to `changeset publish`. */
	forwarded: string[];
};

/** Split opx's own flags out of the publish args. */
export function parsePublishArgs(args: string[]): PublishArgs {
	const parsed: PublishArgs = { noGitTag: args.includes("--no-git-tag"), forwarded: [] };
	for (const arg of args) {
		if (arg === "--no-push") parsed.push = false;
		else if (arg === "--no-github-release") parsed.githubReleases = false;
		else if (arg === "--action") parsed.action = true;
		else if (arg === "--no-action") parsed.action = false;
		else parsed.forwarded.push(arg);
	}
	return parsed;
}

/** Whether the repository ships a GitHub Action (an `action.yml` at its root). */
export function isActionRepo(cwd: string): boolean {
	return existsSync(join(cwd, "action.yml")) || existsSync(join(cwd, "action.yaml"));
}

/**
 * Combine `.opx/config.json` `release` settings, flags, and detection. Flags win, then config,
 * then defaults: push, create GitHub releases, and release as an Action when `action.yml` exists.
 */
export function resolveSettings(cwd: string, config: unknown, args: Pick<PublishArgs, "push" | "githubReleases" | "action">): ReleaseSettings {
	const settings = (typeof config === "object" && config !== null ? config : {}) as {
		push?: unknown;
		githubReleases?: unknown;
		action?: unknown;
	};
	const actionConfig = settings.action;
	const actionOn = args.action ?? (typeof actionConfig === "boolean" ? actionConfig : typeof actionConfig === "object" && actionConfig !== null ? true : isActionRepo(cwd));
	const actionObject = (typeof actionConfig === "object" && actionConfig !== null ? actionConfig : {}) as { dist?: unknown; majorTag?: unknown };
	return {
		push: args.push ?? settings.push !== false,
		githubReleases: args.githubReleases ?? settings.githubReleases !== false,
		action: actionOn
			? { dist: typeof actionObject.dist === "string" ? actionObject.dist : "dist", majorTag: actionObject.majorTag !== false }
			: false,
	};
}

/** A package version that should have a tag and a GitHub release. */
export type ReleaseTarget = { name: string; version: string; dir: string; tag: string; prerelease: boolean };

/** Where a package publishes. `scope` is set when a scoped registry (`@scope:registry`) applies. */
export type Registry = { url: string; scope?: string };

/** A public package version that should be on a registry. */
export type RegistryTarget = { name: string; version: string; registry: Registry };

/** The registry changesets publishes to when nothing else is set. */
const NPM_REGISTRY = "https://registry.npmjs.org";

/** Registries changesets treats as npm itself. */
const DEFAULT_REGISTRIES = new Set([NPM_REGISTRY, `${NPM_REGISTRY}/`, "https://registry.yarnpkg.com", "https://registry.yarnpkg.com/"]);

/** How long to wait between registry checks after a failed publish; about a minute in all. */
export const REGISTRY_RETRY_MS = [0, 10_000, 20_000, 30_000];

/**
 * A package's registry, found the way changesets finds it: the scope's registry from
 * `publishConfig` or `npm_config_<scope>:registry`, then `publishConfig.registry`, then
 * `npm_config_registry`, then npm.
 */
export function registryFor(packageJson: { name: string; publishConfig?: Record<string, unknown> }, env: NodeJS.ProcessEnv = process.env): Registry {
	const config = packageJson.publishConfig ?? {};
	if (packageJson.name.startsWith("@")) {
		const scope = packageJson.name.split("/")[0];
		const scoped = config[`${scope}:registry`] || env[`npm_config_${scope}:registry`];
		if (typeof scoped === "string" && scoped) return { url: scoped, scope };
	}
	const url = config.registry || env.npm_config_registry;
	return { url: typeof url === "string" && url && !DEFAULT_REGISTRIES.has(url) ? url : NPM_REGISTRY };
}

/** Runs npm in a folder; returns its output, or `undefined` when npm fails. */
export type NpmRunner = (args: string[], cwd: string) => Promise<string | undefined>;

const execFileAsync = promisify(execFile);

/** Run npm in `cwd`, so it reads that project's `.npmrc`. Windows needs the `.cmd` shim and a shell. */
export const runNpm: NpmRunner = async (args, cwd) => {
	const windows = process.platform === "win32";
	try {
		const { stdout } = await execFileAsync(windows ? "npm.cmd" : "npm", args, { cwd, shell: windows, encoding: "utf8" });
		return stdout;
	} catch {
		return undefined;
	}
};

/**
 * Whether a version is on its registry, asked with `npm view` against the registry changesets
 * published to. A lookup that fails counts as not listed.
 * @param npm - Injected in tests.
 */
export async function isOnRegistry(cwd: string, target: RegistryTarget, npm: NpmRunner = runNpm): Promise<boolean> {
	const { url, scope } = target.registry;
	const output = await npm(["view", `${target.name}@${target.version}`, "version", "--json", `--${scope ? `${scope}:` : ""}registry=${url}`], cwd);
	if (!output?.trim()) return false;
	try {
		const listed: unknown = JSON.parse(output);
		return Array.isArray(listed) ? listed.includes(target.version) : listed === target.version;
	} catch {
		return false;
	}
}

/** The current version of every public package changesets would publish. */
export async function registryTargets(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<RegistryTarget[]> {
	const packages = await getPackages(cwd);
	const config = await readConfig(cwd, packages);
	return packages.packages
		.filter((pkg) => !shouldSkipPackage(pkg, { ignore: config.ignore, allowPrivatePackages: false }))
		.map((pkg) => ({ name: pkg.packageJson.name, version: pkg.packageJson.version, registry: registryFor(pkg.packageJson as { name: string; publishConfig?: Record<string, unknown> }, env) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The current version of every package changesets tags: public packages, and private ones
 * when `privatePackages.tag` is on. Tags follow changesets: `v1.2.3` for a single package,
 * `name@1.2.3` in a monorepo.
 */
export async function releaseTargets(cwd: string): Promise<ReleaseTarget[]> {
	const packages = await getPackages(cwd);
	const config = await readConfig(cwd, packages);
	const single = packages.tool === "root";
	return packages.packages
		.filter((pkg) => !shouldSkipPackage(pkg, { ignore: config.ignore, allowPrivatePackages: config.privatePackages.tag }))
		.map((pkg) => {
			const { name, version } = pkg.packageJson;
			return { name, version, dir: pkg.dir, tag: single ? `v${version}` : `${name}@${version}`, prerelease: version.includes("-") };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The notes under a version's heading in a changelog, or `""` when there are none. */
export function changelogSection(source: string, version: string): string {
	const lines = source.split(/\r?\n/);
	const heading = (line: string) => /^##\s/.test(line) && !/^###/.test(line);
	const start = lines.findIndex((line) => heading(line) && line.replace(/^##\s+/, "").trim() === version);
	if (start === -1) return "";
	const end = lines.findIndex((line, i) => i > start && heading(line));
	return lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join("\n")
		.trim();
}

/** Who commits the Action build when git has no identity, as in a fresh CI checkout. */
const BOT = { name: "github-actions[bot]", email: "41898283+github-actions[bot]@users.noreply.github.com" };

/** Git identity variables, falling back to the Actions bot when none is configured. */
function identity(cwd: string): Record<string, string> {
	if (git(cwd, ["config", "user.email"]).stdout) return {};
	return { GIT_AUTHOR_NAME: BOT.name, GIT_AUTHOR_EMAIL: BOT.email, GIT_COMMITTER_NAME: BOT.name, GIT_COMMITTER_EMAIL: BOT.email };
}

/**
 * Commit the build output onto a release-only commit whose parent is `HEAD`, without touching
 * the working tree, the index, or any branch.
 * @returns The new commit's SHA.
 * @throws When git fails.
 */
export function commitBuild(cwd: string, dist: string, message: string): string {
	const scratch = mkdtempSync(join(tmpdir(), "opx-release-index-"));
	const env = { GIT_INDEX_FILE: join(scratch, "index"), ...identity(cwd) };
	try {
		const steps: string[][] = [["read-tree", "HEAD"], ["add", "--force", "--", dist]];
		for (const args of steps) {
			const result = git(cwd, args, env);
			if (!result.ok) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
		}
		const tree = git(cwd, ["write-tree"], env);
		if (!tree.ok) throw new Error(`git write-tree failed: ${tree.stderr}`);
		const commit = git(cwd, ["commit-tree", tree.stdout, "-p", "HEAD", "-m", message], env);
		if (!commit.ok) throw new Error(`git commit-tree failed: ${commit.stderr}`);
		return commit.stdout;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/** Injectable seams so the flow can run in tests without npm or GitHub. */
export type PublishDeps = {
	ui: Ui;
	/** Run `changeset publish` with these args. */
	publish: (cwd: string, args: string[]) => Promise<number>;
	/** A GitHub client, or why there isn't one. */
	github: (cwd: string) => GitHubClient | { reason: string };
	/** Whether a version is listed on its registry. */
	onRegistry: (cwd: string, target: RegistryTarget) => Promise<boolean>;
	/** Pause between registry checks. */
	wait: (ms: number) => Promise<void>;
};

/** A GitHub client from `GITHUB_TOKEN` and the repository, or why one can't be made. */
export function githubFromEnv(cwd: string, env: NodeJS.ProcessEnv = process.env): GitHubClient | { reason: string } {
	const token = env.GITHUB_TOKEN;
	if (!token) return { reason: "set GITHUB_TOKEN to create them" };
	const repo = env.GITHUB_REPOSITORY || detectRepo(cwd);
	if (!repo) return { reason: "no GitHub repository in package.json or GITHUB_REPOSITORY" };
	return githubClient({ token, repo });
}

/** The real publish step and GitHub client, writing to the terminal. Hosts swap in their own `ui`. */
export const publishDeps: PublishDeps = {
	ui: defaultUi,
	publish: (cwd, args) => runChangeset(cwd, ["publish", ...args]),
	github: (cwd) => githubFromEnv(cwd),
	onRegistry: isOnRegistry,
	wait: sleep,
};

/** What happened to one package's tag and release, for the summary. */
type Outcome = { target: ReleaseTarget; tag: "new" | "exists" | "moved" | "failed" | "skipped"; release: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Check the registry for each public version, retrying on `REGISTRY_RETRY_MS`.
 * @returns `name@version` for each version still missing.
 */
async function missingFromRegistry(cwd: string, deps: PublishDeps): Promise<string[]> {
	let missing = await registryTargets(cwd);
	for (const delay of REGISTRY_RETRY_MS) {
		if (missing.length === 0) break;
		if (delay > 0) {
			deps.ui.step("Waiting for the registry", `${plural(missing.length, "version")} not listed yet`);
			await deps.wait(delay);
		}
		const listed = await Promise.all(missing.map((target) => deps.onRegistry(cwd, target)));
		missing = missing.filter((_, i) => !listed[i]);
	}
	return missing.map((target) => `${target.name}@${target.version}`);
}

/**
 * Publish, then finish the release: tag each published version, push the tags, create the
 * GitHub releases, and for an Action repository commit the build and move the major tag.
 * Every step skips what is already done, so a failed run can be re-run. When changesets fails
 * but every public version turns up on the registry, the release carries on.
 *
 * @param config - The `release` value from `.opx/config.json`.
 * @returns `0` when every step worked; otherwise the publish exit code, or `1`.
 */
export async function runPublish(cwd: string, args: string[], config: unknown, deps: PublishDeps = publishDeps): Promise<number> {
	const { ui } = deps;
	const parsed = parsePublishArgs(args);
	const settings = resolveSettings(cwd, config, parsed);

	ui.heading("opx release · publish");
	ui.step("Publishing with changesets");
	const code = await deps.publish(cwd, parsed.forwarded);
	ui.gap();
	if (code !== 0) {
		ui.warn(`changesets exited with ${code}`, "checking the registry");
		const missing = await missingFromRegistry(cwd, deps);
		if (missing.length > 0) {
			ui.fail("Publishing failed", `not on the registry: ${missing.join(", ")}`);
			ui.hint("Nothing was tagged. Fix the error and run it again; published versions are skipped.");
			return code;
		}
		ui.ok("Every version is on the registry", "finishing the release");
	} else {
		ui.ok("Published to the registry");
	}

	if (parsed.noGitTag) {
		ui.skip("Tags and GitHub releases", "--no-git-tag");
		return 0;
	}
	if (!git(cwd, ["rev-parse", "--git-dir"]).ok) {
		ui.skip("Tags and GitHub releases", "not a git repository");
		return 0;
	}

	const targets = await releaseTargets(cwd);
	let failed = false;
	const outcomes: Outcome[] = targets.map((target) => ({ target, tag: "exists", release: "" }));
	const hasOrigin = git(cwd, ["remote", "get-url", "origin"]).ok;
	const remoteTags = new Set(
		hasOrigin
			? git(cwd, ["ls-remote", "--tags", "origin"])
				.stdout.split("\n")
				.map((line) => line.split("\t")[1]?.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""))
				.filter((tag): tag is string => Boolean(tag))
			: [],
	);
	const hasLocal = (tag: string) => git(cwd, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).ok;
	const toPush: string[] = [];

	// An Action repository releases one package: its tag points at a commit that holds the build.
	if (settings.action) {
		const [target, ...others] = targets;
		if (!target || others.length > 0) {
			ui.fail("Can't release as a GitHub Action", `that needs exactly one package; found ${targets.length}`);
			return 1;
		}
		const outcome = outcomes[0] as Outcome;
		if (remoteTags.has(target.tag)) {
			ui.skip(`${target.tag} is already on origin`, "the Action build was committed before");
		} else if (!existsSync(join(cwd, settings.action.dist))) {
			ui.fail(`No ${settings.action.dist}/ to release`, "build before publishing, or set release.action.dist");
			return 1;
		} else {
			try {
				const commit = commitBuild(cwd, settings.action.dist, `chore(release): ${target.tag}`);
				git(cwd, ["tag", "--force", target.tag, commit]);
				toPush.push(target.tag);
				outcome.tag = "new";
				ui.ok(`Committed ${settings.action.dist}/ for ${target.tag}`, commit.slice(0, 7));
				const major = `v${target.version.split(".")[0]}`;
				if (settings.action.majorTag && !target.prerelease) {
					git(cwd, ["tag", "--force", major, commit]);
					toPush.push(`+${major}`);
					outcome.tag = "moved";
					ui.ok(`Moved ${major} to ${target.tag}`);
				} else if (target.prerelease) {
					ui.skip(`Left ${major} alone`, "prereleases don't move the major tag");
				}
			} catch (err) {
				ui.fail(`Couldn't commit ${settings.action.dist}/ for ${target.tag}`, (err as Error).message);
				return 1;
			}
		}
	} else {
		const tagged: string[] = [];
		for (const outcome of outcomes) {
			const { tag } = outcome.target;
			if (!hasLocal(tag)) {
				if (!git(cwd, ["tag", tag]).ok) {
					outcome.tag = "failed";
					failed = true;
					ui.fail(`Couldn't tag ${tag}`);
					continue;
				}
				tagged.push(tag);
			}
			if (!remoteTags.has(tag)) {
				toPush.push(tag);
				outcome.tag = "new";
			}
		}
		if (tagged.length > 0) ui.ok(`Tagged ${plural(tagged.length, "version")}`, tagged.join(", "));
	}

	// Push what origin doesn't have yet; `+` marks a tag that moves.
	let pushed = toPush.length === 0;
	if (toPush.length === 0) {
		ui.skip("Pushing tags", "origin already has them");
	} else if (!settings.push) {
		ui.skip("Pushing tags", "push is off");
	} else if (!hasOrigin) {
		ui.skip("Pushing tags", "no origin remote");
	} else {
		const refs = toPush.map((tag) => (tag.startsWith("+") ? `+refs/tags/${tag.slice(1)}` : `refs/tags/${tag}`));
		const result = git(cwd, ["push", "origin", ...refs]);
		pushed = result.ok;
		if (result.ok) ui.ok(`Pushed ${plural(toPush.length, "tag")} to origin`, toPush.map((tag) => tag.replace(/^\+/, "")).join(", "));
		else {
			failed = true;
			ui.fail("Couldn't push tags", result.stderr.split("\n").pop());
		}
	}

	// A release needs its tag on GitHub, so only tags origin has now get one.
	const onOrigin = (tag: string) => remoteTags.has(tag) || (pushed && settings.push && hasOrigin);
	if (!settings.githubReleases) {
		ui.skip("GitHub releases", "turned off");
		outcomes.forEach((o) => (o.release = "off"));
	} else {
		const client = deps.github(cwd);
		if ("reason" in client) {
			ui.skip("GitHub releases", client.reason);
			outcomes.forEach((o) => (o.release = "skipped"));
		} else {
			let existing = new Set<string>();
			try {
				existing = await client.releasedTags();
			} catch (err) {
				ui.warn("Couldn't list GitHub releases", (err as Error).message);
			}
			let created = 0;
			for (const outcome of outcomes) {
				const { target } = outcome;
				if (outcome.tag === "failed" || !onOrigin(target.tag)) {
					outcome.release = "skipped";
					continue;
				}
				if (existing.has(target.tag)) {
					outcome.release = "exists";
					continue;
				}
				const changelog = join(target.dir, "CHANGELOG.md");
				const body = existsSync(changelog) ? changelogSection(readFileSync(changelog, "utf8"), target.version) : "";
				try {
					const result = await client.createRelease({ tag: target.tag, name: target.tag, body, prerelease: target.prerelease });
					outcome.release = result.status === "created" ? result.url : "exists";
					if (result.status === "created") created++;
				} catch (err) {
					outcome.release = "failed";
					failed = true;
					ui.fail(`Couldn't create the ${target.tag} release`, (err as Error).message);
				}
			}
			if (created > 0) ui.ok(`Created ${plural(created, "GitHub release")}`);
			else if (!failed) ui.skip("GitHub releases", "every tag already has one");
		}
	}

	printSummary(ui, outcomes);
	if (failed) ui.hint("Run `opx release publish` again to finish; completed steps are skipped.");
	return failed ? 1 : 0;
}

/** One row per package: version, what happened to its tag, and its release. */
function printSummary(ui: Ui, outcomes: Outcome[]): void {
	if (outcomes.length === 0) return;
	const { colors: c, symbols: s } = ui;
	const tagCell: Record<Outcome["tag"], string> = {
		new: c.green(`${s.ok} new`),
		moved: c.green(`${s.ok} new + major`),
		exists: c.dim(`${s.skip} exists`),
		failed: c.red(`${s.fail} failed`),
		skipped: c.dim(`${s.skip} skipped`),
	};
	const releaseCell = (release: string) => {
		if (release.startsWith("http")) return c.green(`${s.ok} ${release}`);
		if (release === "failed") return c.red(`${s.fail} failed`);
		return c.dim(`${s.skip} ${release || "skipped"}`);
	};
	ui.gap();
	ui.table(
		["Package", "Version", "Tag", "GitHub release"],
		outcomes.map((o) => [c.bold(o.target.name), o.target.version, tagCell[o.tag], releaseCell(o.release)]),
	);
	ui.gap();
}
