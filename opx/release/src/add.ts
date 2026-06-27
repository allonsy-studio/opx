import writeChangeset from "@changesets/write";
import { getPackages } from "@manypkg/get-packages";
import * as p from "@clack/prompts";
import type { Changeset, VersionType } from "@changesets/types";

import type { DetectorContext } from "@allons-y/opx";

/** The bump levels opx exposes (changesets' `none` is not user-selectable here). */
export type Bump = "patch" | "minor" | "major";
const BUMPS: Bump[] = ["patch", "minor", "major"];

/** A publishable workspace package the user can record a change against. */
export type ReleasablePackage = { name: string; version: string };

/** Flags parsed from `opx release add …` for the non-interactive / CI path. */
export type ParsedAdd = { empty: boolean; type?: string; pkgs: string[]; summary?: string };

// ---------------------------------------------------------------------------
// Pure core (no I/O) — unit-tested directly.
// ---------------------------------------------------------------------------

/** Split a repeatable/comma-separated flag value (`--pkg a,b`) into names. */
function splitList(value: string | undefined): string[] {
	return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse the tail of `release add` into a structured request. Unknown tokens are
 * ignored so changesets-style positionals never break parsing.
 */
export function parseAddArgs(args: string[]): ParsedAdd {
	const parsed: ParsedAdd = { empty: false, pkgs: [] };
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

/** Enumerate publishable workspace packages (excludes private packages + root). */
export async function listReleasablePackages(cwd: string): Promise<ReleasablePackage[]> {
	const { packages } = await getPackages(cwd);
	return packages
		.filter((pkg) => pkg.packageJson.name && !pkg.packageJson.private)
		.map((pkg) => ({ name: pkg.packageJson.name, version: pkg.packageJson.version }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Drive the interactive `add` flow (hybrid bump selection): pick packages, then
 * one bump for all or per-package, then a summary. Returns `null` if cancelled.
 */
export async function collectInteractively(packages: ReleasablePackage[]): Promise<Changeset | null> {
	p.intro("opx release — record a change");

	const selected = await p.multiselect({
		message: "Which packages changed?",
		options: packages.map((pkg) => ({ value: pkg.name, label: pkg.name, hint: pkg.version })),
		required: true,
	});
	if (p.isCancel(selected)) return null;
	const names = selected as string[];

	const PER_PACKAGE = "__per_package__";
	const choice = await p.select({
		message: "Bump type for the selected packages?",
		options: [
			{ value: "patch", label: "patch — all selected" },
			{ value: "minor", label: "minor — all selected" },
			{ value: "major", label: "major — all selected" },
			{ value: PER_PACKAGE, label: "choose per package…" },
		],
	});
	if (p.isCancel(choice)) return null;

	const releases: Array<{ name: string; type: Bump }> = [];
	if (choice === PER_PACKAGE) {
		for (const name of names) {
			const type = await p.select({
				message: `Bump for ${name}?`,
				options: BUMPS.map((b) => ({ value: b, label: b })),
			});
			if (p.isCancel(type)) return null;
			releases.push({ name, type: type as Bump });
		}
	} else {
		for (const name of names) releases.push({ name, type: choice as Bump });
	}

	const summary = await p.text({
		message: "Summary of the change",
		validate: (value) => (value && value.trim() ? undefined : "A summary is required."),
	});
	if (p.isCancel(summary)) return null;

	const changeset = toChangeset(releases, String(summary));
	p.outro(`Recorded a ${releases.length === 1 ? "change" : "change set"} for ${releases.length} package(s).`);
	return changeset;
}

// ---------------------------------------------------------------------------
// Orchestration — flags → CI path, otherwise prompt; writes the changeset file.
// ---------------------------------------------------------------------------

/** Injectable I/O seams so `runAdd` can be unit-tested without a TTY or fs. */
export type AddDeps = {
	isInteractive: () => boolean;
	listPackages: (cwd: string) => Promise<ReleasablePackage[]>;
	collect: (packages: ReleasablePackage[]) => Promise<Changeset | null>;
	write: (changeset: Changeset, cwd: string) => Promise<string>;
};

const defaultDeps: AddDeps = {
	isInteractive,
	listPackages: listReleasablePackages,
	collect: collectInteractively,
	write: (changeset, cwd) => writeChangeset(changeset, cwd),
};

/**
 * Record a change: build a changeset (from flags when given, otherwise by
 * prompting) and write it to `.changeset/`. Replaces interactive `changeset add`.
 *
 * @returns `0` on success; `1` on cancellation or invalid/missing input.
 */
export async function runAdd(ctx: DetectorContext, addArgs: string[], deps: AddDeps = defaultDeps): Promise<number> {
	const parsed = parseAddArgs(addArgs);

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
		const packages = await deps.listPackages(ctx.cwd);
		if (packages.length === 0) {
			console.error("opx: no publishable packages found.");
			return 1;
		}
		const collected = await deps.collect(packages);
		if (!collected) {
			console.log("opx: release add cancelled.");
			return 1;
		}
		changeset = collected;
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
