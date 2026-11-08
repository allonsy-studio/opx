import { read as readConfig } from "@changesets/config";
import { shouldSkipPackage } from "@changesets/should-skip-package";
import writeChangeset from "@changesets/write";
import { getPackages } from "@manypkg/get-packages";
import type { Changeset, VersionType } from "@changesets/types";

import type { DetectorContext } from "@allons-y/opx";

import { runChangeset } from "./changeset-cli.js";

/** The bump levels opx exposes (changesets' `none` is not user-selectable here). */
export type Bump = "patch" | "minor" | "major";
const BUMPS: Bump[] = ["patch", "minor", "major"];

/** A workspace package changesets would let the user record a change against. */
export type ReleasablePackage = { name: string; version: string };

/** Flags parsed from `opx release add …` for the non-interactive / CI path. */
export type ParsedAdd = { empty: boolean; type?: string; pkgs: string[]; summary?: string; positionals?: string[] };

/** `opx release` subcommands that land in `add` when typed after `yarn changeset`. */
const OTHER_SUBCOMMANDS = new Set(["status", "version", "publish", "pre", "tag", "init"]);

// ---------------------------------------------------------------------------
// Pure core (no I/O) — unit-tested directly.
// ---------------------------------------------------------------------------

/** Split a repeatable/comma-separated flag value (`--pkg a,b`) into names. */
function splitList(value: string | undefined): string[] {
	return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse the tail of `release add` into a structured request. Unknown flags are
 * ignored; bare words are kept in `positionals` so `runAdd` can catch a mistyped subcommand.
 */
export function parseAddArgs(args: string[]): ParsedAdd {
	const parsed: ParsedAdd = { empty: false, pkgs: [], positionals: [] };
	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--empty":
				parsed.empty = true;
				break;
			case "--type":
			case "-t":
				parsed.type = args[++i];
				break;
			case "--pkg":
			case "-p":
				parsed.pkgs.push(...splitList(args[++i]));
				break;
			case "--summary":
			case "-m":
				parsed.summary = args[++i];
				break;
			default:
				if (!args[i]?.startsWith("-")) parsed.positionals?.push(args[i] as string);
				break;
		}
	}
	return parsed;
}

/** True when the user supplied any add flag (so we take the non-interactive path). */
export function hasAddFlags(parsed: ParsedAdd): boolean {
	return parsed.empty || parsed.type !== undefined || parsed.pkgs.length > 0 || parsed.summary !== undefined;
}

/** Assemble a changeset object from selected releases and a summary. */
export function toChangeset(releases: Array<{ name: string; type: Bump }>, summary: string): Changeset {
	return {
		summary: summary.trim(),
		releases: releases.map((r) => ({ name: r.name, type: r.type as VersionType })),
	};
}

/**
 * Build a changeset from parsed flags, validating against the available
 * packages. Throws a user-facing `Error` on any invalid/missing input.
 */
export function changesetFromFlags(parsed: ParsedAdd, available: ReleasablePackage[]): Changeset {
	if (parsed.empty) return { summary: "", releases: [] };

	if (!parsed.type) throw new Error("`--type <patch|minor|major>` is required (or pass --empty).");
	if (!(BUMPS as string[]).includes(parsed.type)) {
		throw new Error(`invalid --type "${parsed.type}" (expected patch, minor, or major).`);
	}
	if (parsed.pkgs.length === 0) throw new Error("at least one `--pkg <name>` is required (or pass --empty).");

	const known = new Set(available.map((pkg) => pkg.name));
	const unknown = parsed.pkgs.filter((name) => !known.has(name));
	if (unknown.length > 0) throw new Error(`unknown package(s): ${unknown.join(", ")}.`);

	if (!parsed.summary || !parsed.summary.trim()) {
		throw new Error("`--summary <text>` is required (or pass --empty).");
	}

	return toChangeset(parsed.pkgs.map((name) => ({ name, type: parsed.type as Bump })), parsed.summary);
}

// ---------------------------------------------------------------------------
// I/O edges — thin wrappers around the filesystem, the workspace, and prompts.
// ---------------------------------------------------------------------------

/**
 * Whether opx may prompt. Mirrors the CLI's `detectMode`; kept local because a
 * plugin cannot depend on opx-cli. A shared version belongs in @allons-y/opx.
 */
export function isInteractive(): boolean {
	if (process.env.OPX_NONINTERACTIVE) return false;
	if (process.env.CI) return false;
	return Boolean(process.stdout.isTTY);
}

/**
 * The packages `changeset add` offers: it skips names in the config's `ignore`,
 * packages without a version, and private packages unless `privatePackages.version` is on.
 * Uses changesets' own config reader and rule so opx can't drift from it.
 */
export async function listReleasablePackages(cwd: string): Promise<ReleasablePackage[]> {
	const packages = await getPackages(cwd);
	const config = await readConfig(cwd, packages);
	return packages.packages
		.filter((pkg) => !shouldSkipPackage(pkg, { ignore: config.ignore, allowPrivatePackages: config.privatePackages.version }))
		.map((pkg) => ({ name: pkg.packageJson.name, version: pkg.packageJson.version }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Orchestration — flags → opx writes the changeset; a terminal → changesets' own prompt.
// ---------------------------------------------------------------------------

/** Injectable I/O seams so `runAdd` can be unit-tested without a TTY or fs. */
export type AddDeps = {
	isInteractive: () => boolean;
	listPackages: (cwd: string) => Promise<ReleasablePackage[]>;
	write: (changeset: Changeset, cwd: string) => Promise<string>;
	/** Run `changeset add` with these args and return its exit code. */
	prompt: (cwd: string, args: string[]) => Promise<number>;
};

const defaultDeps: AddDeps = {
	isInteractive,
	listPackages: listReleasablePackages,
	write: (changeset, cwd) => writeChangeset(changeset, cwd),
	prompt: (cwd, args) => runChangeset(cwd, ["add", ...args]),
};

/**
 * Record a change. With flags, opx validates them and writes the changeset, which
 * changesets can't do without prompting. In a terminal without flags, it runs
 * changesets' own `add` prompt, passing every argument through (`--open`, `--since`).
 *
 * @returns `0` on success; otherwise `1`, or the prompt's exit code.
 */
export async function runAdd(ctx: DetectorContext, addArgs: string[], deps: AddDeps = defaultDeps): Promise<number> {
	const parsed = parseAddArgs(addArgs);
	const other = parsed.positionals?.find((word) => OTHER_SUBCOMMANDS.has(word));
	if (other) {
		console.error(`opx: \`${other}\` isn't an option for \`release add\`. Did you mean \`opx release ${other}\`?`);
		return 1;
	}

	let changeset: Changeset;
	if (hasAddFlags(parsed)) {
		// `--empty` needs no package list; everything else validates against it.
		const available = parsed.empty ? [] : await deps.listPackages(ctx.cwd);
		try {
			changeset = changesetFromFlags(parsed, available);
		} catch (err) {
			console.error(`opx: ${(err as Error).message}`);
			return 1;
		}
	} else if (deps.isInteractive()) {
		return deps.prompt(ctx.cwd, addArgs);
	} else {
		console.error(
			"opx: `release add` needs an interactive terminal, or pass --type/--pkg/--summary (or --empty).",
		);
		return 1;
	}

	const id = await deps.write(changeset, ctx.cwd);
	console.log(`opx: wrote .changeset/${id}.md — run \`opx release version\` to apply.`);
	return 0;
}
