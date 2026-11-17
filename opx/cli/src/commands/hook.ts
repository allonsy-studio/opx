import type { Command } from "commander";
import type { BuiltInShortName } from "../built-in.js";

import { basename } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import { enabledNames, isDeferred, readConfig, readState, writeState } from "@allons-y/opx";

import { fileTypesOf, getCurrentBranch, getHeadCommit, listFilesInHeadCommit } from "../scanner.js";
import builtIns from "../built-in.js";
import { buildContext } from "../context.js";
import { colors } from "../colors.js";

export default function register(program: Command): void {
	const hook = program.command("hook").description("Internal — invoked by git hooks");

	hook
		.command("post-commit")
		.description("Detect new file types in the latest commit and nudge the user")
		.action(() => {
			runPostCommit();
		});

	hook
		.command("run <name> [args...]", { isDefault: true, hidden: true })
		.description("Run the enabled plugins that declared a git hook, with git's arguments")
		.allowUnknownOption(true)
		.action(async (name: string, args: string[]) => {
			let ctx: DetectorContext;
			try {
				ctx = buildContext({ cwd: process.cwd(), hook: name });
			} catch (error) {
				process.stderr.write(`${colors.yellow("▲")} Skipped the ${name} hook ${colors.dim(error instanceof Error ? error.message : String(error))}\n`);
				return;
			}
			process.exitCode = await runHook(ctx, name, args);
		});
}

/**
 * Run every enabled plugin that declared a git hook.
 *
 * Plugins run in order, each with git's arguments and `ctx.hook` set. Every one
 * runs even after a failure, so each can report; a plugin that throws counts as
 * failed. A broken config is reported and passes, so it never locks up git.
 *
 * @param ctx - The detector context, built with `hook` set to `name`.
 * @param name - The git hook, such as `commit-msg`.
 * @param args - The arguments git passed to the hook.
 * @param load - Loads the enabled plugins' detectors; injectable for tests.
 * @returns The first failing plugin's exit code, or `0`.
 */
export async function runHook(ctx: DetectorContext, name: string, args: string[], load: typeof builtIns.load = builtIns.load): Promise<number> {
	const detectors = (await load(ctx)).filter((detector) => detector.hooks?.[name] !== undefined);
	let exitCode = 0;
	for (const detector of detectors) {
		try {
			const code = (await detector.run?.(ctx, args)) ?? 0;
			if (code !== 0 && exitCode === 0) exitCode = code;
		} catch (error) {
			process.stderr.write(`${colors.red("✖")} ${detector.shortName} failed ${colors.dim(error instanceof Error ? error.message : String(error))}\n`);
			if (exitCode === 0) exitCode = 1;
		}
	}
	return exitCode;
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
		for (const type of fileTypesOf(basename(file))) newTypes.add(type);
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
