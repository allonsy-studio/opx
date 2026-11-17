import { inspectPackageManager, installCommand, loadPlugins, readConfig, type Detector, type Logger, type PackageJson } from "@allons-y/opx";

import { buildContext, readHostPackage } from "./context.js";
import { load } from "./built-in.js";
import { describeHook, syncHooks } from "./git-hooks.js";
import { eslintConfigHint } from "./eslint-scaffold.js";
import { LINT_JS_UPGRADE, lintJsLintsTypeScript } from "./lint-js-version.js";
import { CLI_NAME } from "./plugin-kit.js";
import { saveConfig } from "./save-config.js";
import type { TaskKind } from "./plugin-catalog.js";
import { resolveTarget, toggle } from "./toggle.js";

/** Reads the dynamic tasks an installed plugin's detectors declare, or `undefined` if it can't be loaded. */
export type ConcernReader = (id: string, cwd: string, hostPkg: PackageJson) => Promise<TaskKind[] | undefined>;

/** Loads the detectors of the plugins enabled in the repository's config. */
export type EnabledReader = (cwd: string) => Promise<Detector[]>;

const SILENT: Logger = { info() {}, warn() {}, error() {}, debug() {} };

/** Loads the plugin and collects the `lint` and `build` concerns of its detectors. */
export const readConcerns: ConcernReader = async (id, cwd, hostPkg) => {
	const [plugin] = await loadPlugins([id], { hostPkg, cwd, logger: SILENT });
	if (!plugin) return undefined;
	const concerns = new Set(plugin.detectors.map((d) => d.concern));
	return (["lint", "build"] as const).filter((task) => concerns.has(task));
};

/** Loads the enabled plugins' detectors without reporting plugins that aren't installed. */
export const readEnabled: EnabledReader = (cwd) => load(buildContext({ cwd, logger: SILENT }));

/**
 * Enable or disable a plugin in `.opx/config.json` and report the result.
 *
 * Writes the config only when something changed, so a no-op never creates or
 * rewrites the file. Enabling a third-party plugin without `--task` loads it
 * to read which tasks it runs in. After enabling a lint plugin, prints what
 * the project still needs: the lines its own `eslint.config.js` lacks, and a
 * `lint-js` upgrade when a 0.x release would lint `.ts` files alongside `lint-ts`.
 * Then installs the git hooks the plugin declares, or removes the lines opx wrote
 * for the hooks no other enabled plugin declares.
 *
 * @param cwd - The repository root.
 * @param name - A plugin short name or full package id.
 * @param enable - `true` to enable, `false` to disable.
 * @param tasks - Restrict to these tasks; defaults to every task the plugin provides.
 * @param concernsOf - Reads a third-party plugin's tasks; injectable for tests.
 * @param enabled - Reads the enabled plugins' detectors; injectable for tests.
 * @returns `0` on success (including no-ops), `1` for an invalid request.
 */
export async function runToggleCommand(cwd: string, name: string, enable: boolean, tasks?: TaskKind[], concernsOf: ConcernReader = readConcerns, enabled: EnabledReader = readEnabled): Promise<number> {
	const config = readConfig(cwd);
	const hostPkg = readHostPackage(cwd);
	const target = resolveTarget(name, hostPkg);
	const concerns = enable && target.kind === "package" && !tasks?.length ? await concernsOf(target.name, cwd, hostPkg) : undefined;
	const result = toggle(config, name, enable, hostPkg, tasks, concerns);
	if ("error" in result) {
		console.error(`${CLI_NAME}: ${result.error}`);
		return 1;
	}
	const changed = result.config !== config;
	const before = changed ? await enabled(cwd) : [];
	if (changed) saveConfig(cwd, result.config);
	console.log(`${CLI_NAME}: ${result.message}`);
	if (changed) for (const report of syncHooks(cwd, before, await enabled(cwd))) console.log(describeHook(report));
	const key = target.name;
	if (enable && result.config !== config && result.config.lint?.[key] !== undefined) {
		const hint = eslintConfigHint(cwd, [key]);
		if (hint) console.log(`${CLI_NAME}: ${hint}`);
		if (key === "ts" && lintJsLintsTypeScript(cwd, hostPkg)) {
			const cmd = installCommand(inspectPackageManager(cwd, hostPkg).name, [LINT_JS_UPGRADE]);
			console.log(`${CLI_NAME}: your @allons-y/opx-lint-js is a 0.x release, which also lints TypeScript, so .ts files would be linted twice. Upgrade it:\n  ${cmd}`);
		}
	}
	return 0;
}
