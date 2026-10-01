import { readConfig, writeConfig } from "@allons-y/opx";

import { readHostPackage } from "./context.js";
import { CLI_NAME } from "./plugin-kit.js";
import type { TaskKind } from "./plugin-catalog.js";
import { toggle } from "./toggle.js";

/**
 * Enable or disable a plugin in `.opx/config.json` and report the result.
 *
 * Writes the config only when something changed, so a no-op never creates or
 * rewrites the file.
 *
 * @param cwd - The repository root.
 * @param name - A plugin short name or full package id.
 * @param enable - `true` to enable, `false` to disable.
 * @param tasks - Restrict to these tasks; defaults to every task the plugin provides.
 * @returns `0` on success (including no-ops), `1` for an invalid request.
 */
export function runToggleCommand(cwd: string, name: string, enable: boolean, tasks?: TaskKind[]): number {
	const config = readConfig(cwd);
	const result = toggle(config, name, enable, readHostPackage(cwd), tasks);
	if ("error" in result) {
		console.error(`${CLI_NAME}: ${result.error}`);
		return 1;
	}
	if (result.config !== config) writeConfig(cwd, result.config);
	console.log(`${CLI_NAME}: ${result.message}`);
	return 0;
}
