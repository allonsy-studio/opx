import type { Command } from "commander";

/** Loads a command module, whose default export registers it on the program. */
export type CommandLoader = () => Promise<{ default: (program: Command) => void }>;

/** The commands, each loaded only when it is the one being run. */
export const COMMANDS: Record<string, CommandLoader> = {
	build: () => import("./commands/build.js"),
	disable: () => import("./commands/disable.js"),
	enable: () => import("./commands/enable.js"),
	hook: () => import("./commands/hook.js"),
	init: () => import("./commands/init.js"),
	lint: () => import("./commands/lint.js"),
	release: () => import("./commands/release.js"),
	scan: () => import("./commands/scan.js"),
};

/**
 * Pick the commands to load for an invocation.
 *
 * Help, no command, or an unknown one selects them all, so the listing and
 * "did you mean" suggestions stay complete.
 *
 * @param argv - The command-line arguments after the node binary and script.
 * @returns The loaders for the invoked command, or for every command.
 */
export function selectLoaders(argv: string[]): CommandLoader[] {
	const invoked = argv.find((arg) => !arg.startsWith("-"));
	return invoked !== undefined && Object.hasOwn(COMMANDS, invoked)
		? [COMMANDS[invoked]!]
		: Object.values(COMMANDS);
}
