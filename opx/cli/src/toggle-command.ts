import { loadPlugins, readConfig, type Logger, type PackageJson } from "@allons-y/opx";

import { readHostPackage } from "./context.js";
import { CLI_NAME } from "./plugin-kit.js";
import { saveConfig } from "./save-config.js";
import type { TaskKind } from "./plugin-catalog.js";
import { resolveTarget, toggle } from "./toggle.js";

/** Reads the dynamic tasks an installed plugin's detectors declare, or `undefined` if it can't be loaded. */
export type ConcernReader = (id: string, cwd: string, hostPkg: PackageJson) => Promise<TaskKind[] | undefined>;

const SILENT: Logger = { info() {}, warn() {}, error() {}, debug() {} };

/** Loads the plugin and collects the `lint` and `build` concerns of its detectors. */
export const readConcerns: ConcernReader = async (id, cwd, hostPkg) => {
	const [plugin] = await loadPlugins([id], { hostPkg, cwd, logger: SILENT });
	if (!plugin) return undefined;
	const concerns = new Set(plugin.detectors.map((d) => d.concern));
	return (["lint", "build"] as const).filter((task) => concerns.has(task));
};

/**
 * Enable or disable a plugin in `.opx/config.json` and report the result.
 *
 * Writes the config only when something changed, so a no-op never creates or
 * rewrites the file. Enabling a third-party plugin without `--task` loads it
 * to read which tasks it runs in.
 *
 * @param cwd - The repository root.
 * @param name - A plugin short name or full package id.
 * @param enable - `true` to enable, `false` to disable.
 * @param tasks - Restrict to these tasks; defaults to every task the plugin provides.
 * @param concernsOf - Reads a third-party plugin's tasks; injectable for tests.
 * @returns `0` on success (including no-ops), `1` for an invalid request.
 */
export async function runToggleCommand(cwd: string, name: string, enable: boolean, tasks?: TaskKind[], concernsOf: ConcernReader = readConcerns): Promise<number> {
	const config = readConfig(cwd);
	const hostPkg = readHostPackage(cwd);
	const target = resolveTarget(name, hostPkg);
	const concerns = enable && target.kind === "package" && !tasks?.length ? await concernsOf(target.name, cwd, hostPkg) : undefined;
	const result = toggle(config, name, enable, hostPkg, tasks, concerns);
	if ("error" in result) {
		console.error(`${CLI_NAME}: ${result.error}`);
		return 1;
	}
	if (result.config !== config) saveConfig(cwd, result.config);
	console.log(`${CLI_NAME}: ${result.message}`);
	return 0;
}
