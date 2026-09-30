import type { OpxConfig, PackageJson } from "@allons-y/opx";
import { isValidPluginName, normalizeDetectorId } from "@allons-y/opx";

import { isShipped, isStaticTask, tasksFor, type TaskKind } from "./plugin-catalog.js";

export type ToggleResult = { config: OpxConfig; message: string } | { error: string };

/** Resolve which tasks a toggle applies to, or an error if the request is invalid. */
function resolveTasks(name: string, requested: TaskKind[] | undefined): TaskKind[] | string {
	const provided = tasksFor(name);
	if (!requested || requested.length === 0) return provided;
	const unsupported = requested.filter((task) => !provided.includes(task));
	if (unsupported.length > 0) return `"${name}" does not provide: ${unsupported.join(", ")}.`;
	return requested;
}

/** Whether a name can be toggled: a published plugin, an installed one, or a valid plugin package id. */
function isKnown(name: string, hostPkg: PackageJson): boolean {
	return isShipped(name) || isValidPluginName(name) || normalizeDetectorId(name, hostPkg) !== null;
}

/**
 * Enable or disable a plugin in the config.
 *
 * Static tasks (`release`, `test`) are booleans; everything else is written
 * into the dynamic tasks the plugin actually provides.
 */
export function toggle(config: OpxConfig, name: string, enable: boolean, hostPkg: PackageJson, requested?: TaskKind[]): ToggleResult {
	if (isStaticTask(name)) {
		if (enable && !isShipped(name)) return { error: `"${name}" is not available yet.` };
		if (config[name] === enable) return { config, message: `"${name}" is already ${enable ? "enabled" : "disabled"}.` };
		return { config: { ...config, [name]: enable }, message: `${enable ? "enabled" : "disabled"} "${name}".` };
	}

	if (!isKnown(name, hostPkg)) {
		return { error: `unknown plugin "${name}". Use a short name like js, md, json, or a full package id.` };
	}

	const tasks = resolveTasks(name, requested);
	if (typeof tasks === "string") return { error: tasks };

	const verb = enable ? "enabled" : "disabled";
	const changed = tasks.filter((task) => (enable ? config[task]?.[name] !== true : typeof config[task]?.[name] !== "undefined"));
	if (changed.length === 0) {
		return { config, message: `"${name}" is already ${enable ? "enabled" : "disabled"} in ${tasks.join(", ")}.` };
	}

	const next: OpxConfig = { ...config };
	for (const task of changed) {
		const entries = { ...(config[task] ?? {}) };
		if (enable) entries[name] = true;
		else delete entries[name];
		next[task] = entries;
	}
	return { config: next, message: `${verb} "${name}" in ${changed.join(", ")}.` };
}
