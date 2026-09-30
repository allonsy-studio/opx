import { Command, Option } from "commander";

import { readConfig, writeConfig } from "@allons-y/opx";
import type { TaskKind } from "../plugin-catalog.js";
import { readHostPackage } from "../context.js";
import { CLI_NAME } from "../plugin-kit.js";
import { toggle } from "../toggle.js";

export default function register(program: Command): void {
	program
		.command("disable <name>")
		.description("Disable a detector by short name (e.g. 'js') or fully-qualified package id")
		.addOption(new Option("--task <tasks...>", "which tasks to disable this plugin for (default: all it provides)").choices(["lint", "build"]))
		.action((name: string, opts: { task?: TaskKind[] }) => {
			const cwd = process.cwd();
			const result = toggle(readConfig(cwd), name, false, readHostPackage(cwd), opts.task);
			if ("error" in result) {
				console.error(`${CLI_NAME}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			writeConfig(cwd, result.config);
			console.log(`${CLI_NAME}: ${result.message}`);
		});
}
