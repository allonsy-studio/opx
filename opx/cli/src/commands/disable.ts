import { Command, Option } from "commander";

import { readConfig, writeConfig, type DynamicTask, type OpxConfig } from "@allons-y/opx";
import { CLI_NAME } from "../plugin-kit.js";

export default function register(program: Command): void {
	program
		.command("disable <name>")
		.description("Disable a detector by short name (e.g. 'js') or fully-qualified package id")
		.addOption(new Option("--task <tasks...>", "which tasks to disable this plugin for").choices(["lint", "build"]).default(["lint", "build"]))
		.action((name: string, opts: { task?: DynamicTask[] }) => {
			const cwd = process.cwd();
			const config = readConfig(cwd);
			const tasks: DynamicTask[] = Array.isArray(opts.task) && opts.task.length > 0 ? opts.task : ["lint", "build"];

			const enabledIn = tasks.filter((task) => typeof config[task]?.[name] !== "undefined");
			if (enabledIn.length === 0) {
				console.log(`${CLI_NAME}: "${name}" is not enabled in ${tasks.join(", ")}.`);
				return;
			}
			// Remove the plugin from each task it was enabled in, preserving the rest.
			const next: OpxConfig = { ...config };
			for (const task of enabledIn) {
				const rest = { ...(config[task] ?? {}) };
				delete rest[name];
				next[task] = rest;
			}
			writeConfig(cwd, next);
			console.log(`${CLI_NAME}: disabled "${name}" in ${enabledIn.join(", ")}.`);
		});
}
