import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getPackages } from "@manypkg/get-packages";

import { detectPackageManager } from "@allons-y/opx";
import type { DetectorContext, PackageManager } from "@allons-y/opx";

import { runAdd } from "./add.js";
import { runChangeset } from "./changeset-cli.js";
import { publishDeps, runPublish } from "./publish.js";
import { detectRepo } from "./repo.js";
import { uiFor, type Ui } from "./ui.js";

export { detectRepo };
import { detectBaseBranch } from "./base-branch.js";

/** Read the starter config shipped as `@allons-y/opx-release/config.json`. */
export function starterConfig(): Record<string, unknown> {
	return JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8")) as Record<string, unknown>;
}

/** How each package manager runs the `changeset` script. */
const RUN_CHANGESET: Record<PackageManager, string> = {
	npm: "npm run changeset",
	yarn: "yarn changeset",
	pnpm: "pnpm changeset",
	bun: "bun run changeset",
};

/** The `.changeset/README.md` written on first use, with the repo's package manager. */
export function changesetReadme(pm: PackageManager): string {
	return `# Changesets

Add a changeset for any change a consumer would notice: run \`${RUN_CHANGESET[pm]}\` and write the summary for the changelog. Docs, tests, CI, and internal refactors need none. The release workflow versions and publishes the packages; see [\`@allons-y/opx-release\`](https://www.npmjs.com/package/@allons-y/opx-release).
`;
}

/**
 * Ensure the host repo has a changesets setup. Writes the starter `config.json`,
 * with this repository's `baseBranch`, and a short README when none exists.
 *
 * @returns true if it created the config, false if one was already present.
 */
export function init(ctx: DetectorContext): boolean {
	const dir = join(ctx.cwd, ".changeset");
	const configFile = join(dir, "config.json");
	if (existsSync(configFile)) return false;

	mkdirSync(dir, { recursive: true });
	const config = { ...starterConfig(), baseBranch: detectBaseBranch(ctx.cwd) };
	writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");

	const readme = join(dir, "README.md");
	if (!existsSync(readme)) writeFileSync(readme, changesetReadme(ctx.pkgManager ?? detectPackageManager(ctx.cwd, ctx.hostPkg)), "utf8");

	return true;
}

/** The module name hosts put in `changelog` to opt in to the custom format. */
export const CUSTOM_CHANGELOG = "@allons-y/opx-release/changelog";

/** Flags parsed from `opx release init …`. */
export type InitOptions = { changelog: boolean; maintainers: string[]; releaseDate: boolean };

/** Parse `--changelog` and repeatable/comma-separated `--maintainer <handle>`, which overrides the `package.json` default. */
export function parseInitArgs(args: string[]): InitOptions {
	const parsed: InitOptions = { changelog: false, maintainers: [], releaseDate: false };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--changelog") parsed.changelog = true;
		else if (args[i] === "--date") parsed.releaseDate = true;
		else if (args[i] === "--maintainer") {
			const handles = (args[++i] ?? "").split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
			parsed.maintainers.push(...handles);
		}
	}
	return parsed;
}

/**
 * Point `.changeset/config.json` at the custom changelog generator, keeping every other field.
 * Options already set for this generator are kept; flags only add to them.
 * @returns The `repo` in the options, or `undefined` when none is set or detected.
 */
export function useCustomChangelog(cwd: string, maintainers: string[] = [], releaseDate = false): string | undefined {
	const configFile = join(cwd, ".changeset", "config.json");
	const config = JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>;
	const [name, existing] = Array.isArray(config.changelog) ? config.changelog : [];
	const options: Record<string, unknown> = name === CUSTOM_CHANGELOG && existing && typeof existing === "object" ? { ...existing } : {};
	if (typeof options.repo !== "string" || !options.repo) {
		const repo = detectRepo(cwd);
		if (repo) options.repo = repo;
	}
	if (maintainers.length > 0) options.maintainers = maintainers;
	if (releaseDate) options.releaseDate = true;
	config.changelog = [CUSTOM_CHANGELOG, options];
	writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	return typeof options.repo === "string" ? options.repo : undefined;
}

/** Whether `.changeset/config.json` uses the custom changelog with `releaseDate: true`. */
export function releaseDateEnabled(cwd: string): boolean {
	try {
		const { changelog } = JSON.parse(readFileSync(join(cwd, ".changeset", "config.json"), "utf8")) as { changelog?: unknown };
		return Array.isArray(changelog) && changelog[0] === CUSTOM_CHANGELOG && (changelog[1] as { releaseDate?: unknown } | undefined)?.releaseDate === true;
	} catch {
		return false;
	}
}

/** Map each workspace package directory to its version. */
export async function packageVersions(cwd: string): Promise<Map<string, string>> {
	const { packages } = await getPackages(cwd);
	return new Map(packages.map((pkg) => [pkg.dir, pkg.packageJson.version]));
}

/**
 * Add `📅 _Released <date>_` under the heading for each package's new version. Skips headings that already have one.
 * Keeps the file's line endings.
 * @param bumped - Package directories and the versions `changeset version` just wrote.
 * @param date - As written, for example `8 November 2026`.
 * @returns The changelog files it changed.
 */
export function stampReleaseDates(bumped: Array<{ dir: string; version: string }>, date: string): string[] {
	const stamped: string[] = [];
	for (const { dir, version } of bumped) {
		const file = join(dir, "CHANGELOG.md");
		if (!existsSync(file)) continue;
		const source = readFileSync(file, "utf8");
		const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const heading = new RegExp(`^## ${escaped}[ \\t]*(\\r?\\n)(?!\\s*(?:📅 )?_Released )`, "m");
		if (!heading.test(source)) continue;
		writeFileSync(file, source.replace(heading, (line, eol: string) => `${line}${eol}📅 _Released ${date}_${eol}`), "utf8");
		stamped.push(file);
	}
	return stamped;
}

/** The current commit, or `undefined` outside a git repository. */
function gitHead(cwd: string): string | undefined {
	const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
	return result.status === 0 ? result.stdout.trim() : undefined;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Format a date as `8 November 2026`, in UTC, the same in every locale. */
export function formatReleaseDate(date: Date): string {
	return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Whether `version` args ask for a snapshot, as `--snapshot`, `--snapshot <name>`, or `--snapshot=<name>`. */
export function isSnapshot(args: string[]): boolean {
	return args.some((arg) => arg === "--snapshot" || arg.startsWith("--snapshot="));
}

/**
 * Run `changeset version`, then stamp release dates when the config asks for them.
 * With `"commit": true`, changesets commits first, so the dates are folded into that commit.
 */
async function runVersion(ctx: DetectorContext, args: string[], ui: Ui): Promise<number> {
	const stamp = releaseDateEnabled(ctx.cwd) && !isSnapshot(args);
	const before = stamp ? await packageVersions(ctx.cwd) : new Map<string, string>();
	const headBefore = stamp ? gitHead(ctx.cwd) : undefined;
	const code = await runChangeset(ctx.cwd, args, ui);
	if (code !== 0 || !stamp) return code;
	const after = await packageVersions(ctx.cwd);
	const bumped = [...after].filter(([dir, version]) => before.get(dir) !== version).map(([dir, version]) => ({ dir, version }));
	const files = stampReleaseDates(bumped, formatReleaseDate(new Date()));
	if (files.length === 0) return 0;
	ui.ok(`Added release dates to ${files.length} changelog${files.length === 1 ? "" : "s"}`);
	const headAfter = gitHead(ctx.cwd);
	if (headBefore && headAfter && headBefore !== headAfter) {
		const added = spawnSync("git", ["add", "--", ...files], { cwd: ctx.cwd });
		const amended = added.status === 0 && spawnSync("git", ["commit", "--amend", "--no-edit", "--no-verify"], { cwd: ctx.cwd }).status === 0;
		if (!amended) ui.warn("Couldn't add the release dates to changesets' commit", "commit them yourself");
	}
	return 0;
}

/**
 * Drive the release flow. Ensures changesets is set up (lightweight) and then
 * forwards to the changesets CLI:
 *
 *   opx release            → changeset status
 *   opx release init       → just write the starter config
 *   opx release init --changelog [--date] [--maintainer <handle>] → also opt in to the custom changelog
 *   opx release version    → changeset version, then release dates when enabled
 *   opx release publish    → changeset publish, then tags, GitHub releases, and Action builds
 *   opx release add ...    → opx-native flow (prompts here, no interactive child)
 *   opx release <cmd> ...  → changeset <cmd> ... (version, publish, status, …)
 */
export async function runRelease(ctx: DetectorContext, args: string[]): Promise<number> {
	const ui = uiFor(ctx);
	const created = init(ctx);
	if (created) ui.ok("Set up changesets", ".changeset/config.json and README.md");

	const [sub, ...rest] = args;

	// `opx release init` performs only the lightweight setup above, plus the opt-ins.
	if (sub === "init") {
		const options = parseInitArgs(rest);
		// `--date` only means something with the custom changelog, so it opts in too.
		if (options.changelog || options.releaseDate) {
			const repo = useCustomChangelog(ctx.cwd, options.maintainers, options.releaseDate);
			ui.ok("Switched to the readable changelog format", CUSTOM_CHANGELOG);
			if (!repo) ui.warn("No GitHub repository in package.json", "set `repo` in the changelog options, or GITHUB_REPOSITORY");
			ui.hint("`opx release version` now needs GITHUB_TOKEN to look up pull requests and authors.");
		} else if (!created) {
			ui.skip("Changesets is already set up", ".changeset/config.json");
		}
		return 0;
	}

	// `add` is the one interactive changesets command — opx owns its prompting
	// rather than spawning the changesets CLI's interactive flow.
	if (sub === "add") return runAdd(ctx, rest);

	// Every other subcommand is non-interactive; forward it to the changesets CLI.
	if (sub === "version") return runVersion(ctx, args, ui);
	if (sub === "publish") return runPublish(ctx.cwd, rest, ctx.config.release, { ...publishDeps, ui });
	const forwarded = args.length > 0 ? args : ["status"];
	return runChangeset(ctx.cwd, forwarded, ui);
}
