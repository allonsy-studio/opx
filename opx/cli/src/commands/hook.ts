import type { Command } from "commander";
import type { BuiltInShortName } from "../built-in.js";

import { extname, basename } from "node:path";

import { enabledNames, isDeferred, readConfig, readState, writeState } from "@allons-y/opx";

import { getCurrentBranch, getHeadCommit, listFilesInHeadCommit } from "../scanner.js";
import builtIns from "../built-in.js";

export default function register(program: Command): void {
	const hook = program.command("hook").description("Internal — invoked by git hooks");

	hook
		.command("post-commit")
		.description("Detect new file types in the latest commit and nudge the user")
		.action(() => {
			runPostCommit();
		});
}

/**
 * Nudge about plugins that could handle file types in the latest commit.
 *
 * Skips plugins that are already enabled and ones the user answered "later"
 * for on this branch. Never throws: a git hook must not fail a commit.
 *
 * @param cwd - The repository root.
 * @param today - Today's date as `YYYY-MM-DD`; injectable for tests.
 */
export function runPostCommit(cwd: string = process.cwd(), today: string = new Date().toISOString().slice(0, 10)): void {
	let config;
	let state;
	try {
		config = readConfig(cwd);
		state = readState(cwd);
	} catch {
		// If config is unreadable we exit silently — hooks must never fail.
		return;
	}

	const newFiles = listFilesInHeadCommit(cwd);
	if (newFiles.length === 0) return;

	const newTypes = new Set<string>();
	for (const file of newFiles) {
		const ext = extname(basename(file));
		if (ext) newTypes.add(ext.toLowerCase());
	}

	const enabledLinters = new Set(enabledNames(config.lint));
	const branch = getCurrentBranch(cwd);

	const suggested = builtIns.suggest(newTypes);
	const toNudge = suggested.filter((shortName) => !enabledLinters.has(shortName) && !isDeferred(state, shortName, branch, today));

	for (const shortName of toNudge as BuiltInShortName[]) {
		const pkgs = builtIns.PACKAGE_HINTS[shortName];
		console.log(`opx: new ${shortName} files detected. Run \`opx enable ${shortName}\` to wire up ${pkgs.join(", ")}.`);
	}

	const head = getHeadCommit(cwd);
	if (head && head !== state.lastScanCommit) {
		writeState(cwd, { ...state, lastScanCommit: head });
	}
}
