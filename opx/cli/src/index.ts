#!/usr/bin/env node
export type { ScanResult } from "./scanner.js";
export type { BuildContextOptions } from "./context.js";

import type { PackageJson } from "@allons-y/opx";
import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { CLI_NAME } from "./plugin-kit.js";

export { CLI_NAME } from "./plugin-kit.js";

/** The commands, each loaded only when it is the one being run. */
const COMMANDS: Record<string, () => Promise<{ default: (program: Command) => void }>> = {
	build: () => import("./commands/build.js"),
	disable: () => import("./commands/disable.js"),
	enable: () => import("./commands/enable.js"),
	hook: () => import("./commands/hook.js"),
	init: () => import("./commands/init.js"),
	lint: () => import("./commands/lint.js"),
	release: () => import("./commands/release.js"),
	scan: () => import("./commands/scan.js"),
};

const program = new Command();

/** Get version from package.json */
const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf-8").then(JSON.parse) as PackageJson;
const version = packageJson.version;

program
	.name(CLI_NAME)
	.description("An optionally opinionated front-end developer toolkit")
	.version(version ?? "0.0.0")
	.helpOption("-h, --help", "show help for command")
	.option("--debug", "enable verbose debug logging", false);

// Load just the invoked command. Help, no command, or an unknown one loads them
// all so the listing and "did you mean" suggestions stay complete.
const invoked = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const loaders = invoked !== undefined && invoked in COMMANDS ? [COMMANDS[invoked]!] : Object.values(COMMANDS);
for (const { default: register } of await Promise.all(loaders.map((load) => load()))) {
	register(program);
}

try {
	await program.parseAsync(process.argv);
} catch (err) {
	// Show a one-line message instead of a stack trace unless --debug is set.
	const message = err instanceof Error ? err.message : String(err);
	console.error(`${CLI_NAME}: ${program.opts<{ debug?: boolean }>().debug && err instanceof Error ? (err.stack ?? message) : message}`);
	process.exitCode = 1;
}
