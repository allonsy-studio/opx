import { Command, Option } from "commander";

import { readConfig, writeConfig, type DynamicTask, type OpxConfig } from "@allons-y/opx";
import { CLI_NAME } from "../plugin-kit.js";

export default function register(program: Command): void {
	program
		.command("enable <name>")
		.description("Enable a detector by short name (e.g. 'js') or fully-qualified package id")
		.addOption(new Option("--task <tasks...>", "which tasks to enable this plugin for").choices(["lint", "build"]).default(["lint", "build"]))
		.action((name: string, opts: { task?: DynamicTask[] }) => {
			const cwd = process.cwd();
			const config = readConfig(cwd);
			const tasks: DynamicTask[] = Array.isArray(opts.task) && opts.task.length > 0 ? opts.task : ["lint", "build"];

			if (tasks.every((task) => config[task]?.[name] === true)) {
				console.log(`${CLI_NAME}: "${name}" is already enabled in ${tasks.join(", ")}.`);
				return;
			}
			// Merge the new plugin into each requested task, preserving existing entries.
			const next: OpxConfig = { ...config };
			for (const task of tasks) {
				next[task] = { ...(config[task] ?? {}), [name]: true };
			}
			writeConfig(cwd, next);
			console.log(`${CLI_NAME}: enabled "${name}" in ${tasks.join(", ")}.`);
		});
}
