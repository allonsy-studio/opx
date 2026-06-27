#!/usr/bin/env node
export type { ScanResult } from "./scanner.js";
export type { BuildContextOptions } from "./context.js";

import type { PackageJson } from "@allons-y/opx";
import { readFile } from "node:fs/promises";

import { Command } from "commander";

import registerBuild from "./commands/build.js";
import registerDisable from "./commands/disable.js";
import registerEnable from "./commands/enable.js";
import registerHook from "./commands/hook.js";
import registerInit from "./commands/init.js";
import registerLint from "./commands/lint.js";
import registerRelease from "./commands/release.js";
import registerScan from "./commands/scan.js";

import { CLI_NAME } from "./plugin-kit.js";

export { CLI_NAME } from "./plugin-kit.js";

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

// Iterate over the commands directory and register each command
registerBuild(program);
registerDisable(program);
registerEnable(program);
registerHook(program);
registerInit(program);
registerLint(program);
registerRelease(program);
registerScan(program);

await program.parseAsync(process.argv);
