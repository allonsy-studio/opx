/**
 * Write a changeset for a dependency update, so the packages it changes get released.
 *
 * Compares each published package's `package.json` on this branch with the
 * merge base. If a dependency a user installs with the package changed, it writes
 * one patch changeset naming those packages and the new versions. If nothing
 * shipped changed, it removes that changeset instead. Dev dependencies are ignored.
 *
 * Usage: node scripts/dependency-changeset.js <base-ref> <branch-name>
 *
 * It has no dependencies, so it can run before anything from the branch is installed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The fields a user installs along with a package. */
const SHIPPED = ["dependencies", "optionalDependencies", "peerDependencies"];

/**
 * Find the shipped dependencies that were added, removed, or moved to another range.
 *
 * @param {Record<string, unknown> | undefined} before - The `package.json` at the merge base.
 * @param {Record<string, unknown>} after - The `package.json` on this branch.
 * @returns {Array<{ name: string, from?: string, to?: string }>} The changes.
 */
export function changedDependencies(before, after) {
	const changes = [];
	for (const field of SHIPPED) {
		const from = before?.[field] ?? {};
		const to = after?.[field] ?? {};
		for (const name of new Set([...Object.keys(from), ...Object.keys(to)])) {
			if (from[name] !== to[name]) changes.push({ name, from: from[name], to: to[name] });
		}
	}
	return changes;
}

/** Describe one change, such as `eslint 10.11.0 → 10.12.0`. */
function describe({ name, from, to }) {
	if (from === undefined) return `add ${name} ${to}`;
	if (to === undefined) return `remove ${name}`;
	return `${name} ${from} → ${to}`;
}

/**
 * Build the text of a patch changeset.
 *
 * @param {Array<{ name: string, changes: ReturnType<typeof changedDependencies> }>} packages - The packages that changed.
 * @returns {string} The changeset, or an empty string when no package changed.
 */
export function buildChangeset(packages) {
	if (packages.length === 0) return "";
	const lines = new Set(packages.flatMap(({ changes }) => changes.map(describe)));
	const header = packages.map(({ name }) => `"${name}": patch`).join("\n");
	return `---\n${header}\n---\n\nUpdate dependencies: ${[...lines].join(", ")}.\n`;
}

/** A branch name as a file name: `renovate/plugin-tools` becomes `renovate-plugin-tools`. */
export function slugOf(branch) {
	return branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** Run git in a directory and return its output. */
function git(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Write or remove the changeset for the current branch.
 *
 * @param {string} cwd - The repository root.
 * @param {string} base - The ref the pull request targets, such as `origin/main`.
 * @param {string} branch - The branch name, which names the changeset.
 * @returns {string} What was done.
 */
export function updateChangeset(cwd, base, branch) {
	const slug = slugOf(branch);
	if (!slug) throw new Error("A branch name is required.");
	const target = join(cwd, ".changeset", `${slug}.md`);

	const mergeBase = git(cwd, "merge-base", base, "HEAD").trim();
	const files = git(cwd, "diff", "--name-only", "-z", "--diff-filter=M", mergeBase, "HEAD")
		.split("\0")
		.filter((file) => basename(file) === "package.json");

	const packages = [];
	for (const file of files) {
		const after = JSON.parse(readFileSync(join(cwd, file), "utf8"));
		if (after.private || !after.name) continue;
		const before = JSON.parse(git(cwd, "show", `${mergeBase}:${file}`));
		const changes = changedDependencies(before, after);
		if (changes.length > 0) packages.push({ name: after.name, changes });
	}

	const text = buildChangeset(packages);
	if (!text) {
		if (!existsSync(target)) return "No shipped dependency changed.";
		rmSync(target);
		return `Removed .changeset/${slug}.md; no shipped dependency changed.`;
	}
	if (existsSync(target) && readFileSync(target, "utf8") === text) return `.changeset/${slug}.md is up to date.`;
	writeFileSync(target, text);
	return `Wrote .changeset/${slug}.md for ${packages.map(({ name }) => name).join(", ")}.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [base, branch] = process.argv.slice(2);
	if (!base || !branch) {
		console.error("Usage: node scripts/dependency-changeset.js <base-ref> <branch-name>");
		process.exit(2);
	}
	console.log(updateChangeset(process.cwd(), base, branch));
}
