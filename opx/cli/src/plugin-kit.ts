import type { DetectorContext } from "@allons-y/opx";

import { buildContext } from "./context.js";

/**
 * Shared authoring surface for the opx CLI and its plugins.
 *
 * This module is a dependency-light leaf: it pulls in nothing that runs the CLI,
 * so command modules and tests can import it without triggering the program
 * entrypoint. Keep it that way — it is the one place both first-party commands
 * and third-party plugin authors look for the conventions below.
 */

/** The CLI's invoked name. Used in help text and user-facing messages. */
export const CLI_NAME = "opx" as const;

/**
 * The contract every opx command (and detector runner) follows: do the work and
 * **return an exit code** — never call `process.exit` yourself.
 *
 * Returning the code instead of exiting is what makes a handler unit-testable:
 * a test can call it directly, assert on the number, and inspect any logged
 * output, with no process teardown. The CLI runtime owns the single
 * `process.exit` at the edge (see {@link toAction}).
 *
 * `0` means success; any non-zero value is forwarded as the process exit code.
 * When several handlers/detectors run together, the convention is to surface the
 * first non-zero code (see `runDetectorsGrouped` and the `release` command).
 *
 * @param ctx - The detector context for the host repo (cwd, config, logger, …).
 * @param args - Positional arguments forwarded from the command line.
 * @returns The exit code the process should report.
 */
export type CommandHandler = (ctx: DetectorContext, args: string[]) => Promise<number>;

/**
 * Adapt a {@link CommandHandler} into a commander `.action()` callback.
 *
 * This is the *only* place the CLI builds a context from the current working
 * directory and calls `process.exit`. Authoring a command then comes down to
 * writing a pure `(ctx, args) => Promise<number>` and wiring it up here:
 *
 * ```ts
 * program.command("build").action(toAction(runBuildCommand));
 * ```
 *
 * @param handler - The command's pure, testable handler.
 * @returns A commander action callback that builds the context, runs the
 *   handler, and exits with its code.
 */
export function toAction(handler: CommandHandler): (args?: string[]) => Promise<void> {
	return async (args?: string[]) => {
		const ctx = buildContext({ cwd: process.cwd() });
		process.exit(await handler(ctx, args ?? []));
	};
}
