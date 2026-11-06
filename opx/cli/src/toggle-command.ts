import { inspectPackageManager, installCommand, readConfig, writeConfig } from "@allons-y/opx";

import { readHostPackage } from "./context.js";
import { eslintConfigHint } from "./eslint-scaffold.js";
import { LINT_JS_UPGRADE, lintJsLintsTypeScript } from "./lint-js-version.js";
import { CLI_NAME } from "./plugin-kit.js";
import type { TaskKind } from "./plugin-catalog.js";
import { toggle } from "./toggle.js";

/**
 * Enable or disable a plugin in `.opx/config.json` and report the result.
 *
 * Writes the config only when something changed, so a no-op never creates or
 * rewrites the file. After enabling a lint plugin, prints what the project
 * still needs: the lines its own `eslint.config.js` lacks, and a `lint-js`
 * upgrade when a 0.x release would lint `.ts` files alongside `lint-ts`.
 *
 * @param cwd - The repository root.
 * @param name - A plugin short name or full package id.
 * @param enable - `true` to enable, `false` to disable.
 * @param tasks - Restrict to these tasks; defaults to every task the plugin provides.
 * @returns `0` on success (including no-ops), `1` for an invalid request.
 */
export function runToggleCommand(cwd: string, name: string, enable: boolean, tasks?: TaskKind[]): number {
	const config = readConfig(cwd);
	const hostPkg = readHostPackage(cwd);
	const result = toggle(config, name, enable, hostPkg, tasks);
	if ("error" in result) {
		console.error(`${CLI_NAME}: ${result.error}`);
		return 1;
	}
	if (result.config !== config) writeConfig(cwd, result.config);
	console.log(`${CLI_NAME}: ${result.message}`);
	if (enable && result.config !== config && result.config.lint?.[name] !== undefined) {
		const hint = eslintConfigHint(cwd, [name]);
		if (hint) console.log(`${CLI_NAME}: ${hint}`);
		if (name === "ts" && lintJsLintsTypeScript(cwd, hostPkg)) {
			const cmd = installCommand(inspectPackageManager(cwd, hostPkg).name, [LINT_JS_UPGRADE]);
			console.log(`${CLI_NAME}: your @allons-y/opx-lint-js is a 0.x release, which also lints TypeScript, so .ts files would be linted twice. Upgrade it:\n  ${cmd}`);
		}
	}
	return 0;
}
