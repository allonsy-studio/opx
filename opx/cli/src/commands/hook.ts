import type { Command } from "commander";

import { readConfig, readState, writeState } from "@allons-y/opx";

import { getCurrentBranch, getHeadCommit, listFilesInHeadCommit } from "../scanner.js";
import { BUILTIN_LINT_PACKAGE_HINTS, suggestBuiltins, type BuiltinLintShortName } from "../built-in.js";
import { extname, basename } from "node:path";

export function registerHook(program: Command): void {
	const hook = program.command("hook").description("Internal — invoked by git hooks");

	hook
		.command("post-commit")
		.description("Detect new file types in the latest commit and nudge the user")
		.action(() => {
			runPostCommit();
		});
}

function runPostCommit(): void {
	const cwd = process.cwd();
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

	const enabled = new Set(config.lint);
	const branch = getCurrentBranch(cwd);
	const today = new Date().toISOString().slice(0, 10);

	const suggested = suggestBuiltins(newTypes);
	const toNudge = suggested.filter((shortName) => {
		if (enabled.has(shortName)) return false;
		const deferral = state.deferrals[shortName];
		if (deferral && deferral.branch === branch && deferral.skipUntilDate >= today) return false;
		return true;
	});

	for (const shortName of toNudge as BuiltinLintShortName[]) {
		const pkg = BUILTIN_LINT_PACKAGE_HINTS[shortName];
		console.log(`opx: new ${shortName} files detected — run \`opx enable ${shortName}\` to wire up ${pkg}.`);
	}

	const head = getHeadCommit(cwd);
	if (head && head !== state.lastScanCommit) {
		writeState(cwd, { ...state, lastScanCommit: head });
	}
}
