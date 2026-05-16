import type { Command } from "commander";

import { readConfig, writeConfig } from "@allons-y/opx";

export function registerEnable(program: Command): void {
	program
		.command("enable <name>")
		.description("Enable a detector by short name (e.g. 'js') or fully-qualified package id")
		.option("--concern <concern>", "which concern array to add to (lint|test|build)", "lint")
		.action((name: string, opts: { concern: "lint" | "test" | "build" }) => {
			const cwd = process.cwd();
			const config = readConfig(cwd);
			const array = (config[opts.concern] ?? []) as string[];
			if (array.includes(name)) {
				console.log(`opx: "${name}" is already enabled in ${opts.concern}.`);
				return;
			}
			const next = { ...config, [opts.concern]: [...array, name] };
			writeConfig(cwd, next);
			console.log(`opx: enabled "${name}" in ${opts.concern}.`);
		});
}
