import { Command, Option } from "commander";

import type { TaskKind } from "../plugin-catalog.js";
import { runToggleCommand } from "../toggle-command.js";

export default function register(program: Command): void {
	program
		.command("disable <name>")
		.description("Disable a detector by short name (e.g. 'js') or fully-qualified package id")
		.addOption(new Option("--task <tasks...>", "which tasks to disable this plugin for (default: all it provides)").choices(["lint", "build"]))
		.action((name: string, opts: { task?: TaskKind[] }) => {
			process.exitCode = runToggleCommand(process.cwd(), name, false, opts.task);
		});
}
