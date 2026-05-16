import type { Command } from "commander";

import { readConfig, writeConfig } from "@allons-y/opx";

export function registerDisable(program: Command): void {
	program
		.command("disable <name>")
		.description("Disable a detector by short name (e.g. 'js') or fully-qualified package id")
		.option("--concern <concern>", "which concern array to remove from (lint|test|build)", "lint")
		.action((name: string, opts: { concern: "lint" | "test" | "build" }) => {
			const cwd = process.cwd();
			const config = readConfig(cwd);
			const array = (config[opts.concern] ?? []) as string[];
			if (!array.includes(name)) {
				console.log(`opx: "${name}" is not enabled in ${opts.concern}.`);
				return;
			}
			const filtered = array.filter((x) => x !== name);
			const next = { ...config, [opts.concern]: filtered };
			writeConfig(cwd, next);
			console.log(`opx: disabled "${name}" in ${opts.concern}.`);
		});
}
