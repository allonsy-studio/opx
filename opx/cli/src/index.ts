#!/usr/bin/env node
import { Command } from "commander";

import { registerScan } from "./commands/scan.js";
import { registerInit } from "./commands/init.js";
import { registerEnable } from "./commands/enable.js";
import { registerDisable } from "./commands/disable.js";
import { registerLint } from "./commands/lint.js";
import { registerHook } from "./commands/hook.js";

const program = new Command();

program
	.name("opx")
	.description("opx — optionally opinionated front-end dev ops resources")
	.version("0.1.0")
	.option("--debug", "enable verbose debug logging", false);

registerScan(program);
registerInit(program);
registerEnable(program);
registerDisable(program);
registerLint(program);
registerHook(program);

await program.parseAsync(process.argv);
