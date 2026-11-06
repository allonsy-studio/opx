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

/** Whether a plugin setting is on: `true`, a config path, or inline settings. */
function isOn(setting: unknown): boolean {
	return setting !== undefined && setting !== false;
}

/**
 * The setting to write for a newly enabled plugin.
 *
 * When every other enabled plugin in the task points at the same config file,
 * the new one points there too, so it gets the project's local rules.
 *
 * @param entries - The task's current plugin settings.
 * @param name - The plugin being enabled.
 * @returns That shared path, or `true`.
 */
export function conventionSetting(entries: Record<string, unknown> | undefined, name: string): string | true {
	const others = Object.entries(entries ?? {}).filter(([key, setting]) => key !== name && isOn(setting)).map(([, setting]) => setting);
	const [first] = others;
	return typeof first === "string" && others.every((setting) => setting === first) ? first : true;
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
	const changed = tasks.filter((task) => (enable ? !isOn(config[task]?.[name]) : typeof config[task]?.[name] !== "undefined"));
	if (changed.length === 0) {
		return { config, message: `"${name}" is already ${enable ? "enabled" : "disabled"} in ${tasks.join(", ")}.` };
	}

	const next: OpxConfig = { ...config };
	const shared: string[] = [];
	for (const task of changed) {
		const entries = { ...(config[task] ?? {}) };
		if (enable) {
			entries[name] = conventionSetting(config[task], name);
			if (typeof entries[name] === "string") shared.push(`${task} uses ${entries[name]}`);
		} else delete entries[name];
		next[task] = entries;
	}
	const note = shared.length > 0 ? ` It follows your other plugins: ${shared.join(", ")}.` : "";
	return { config: next, message: `${verb} "${name}" in ${changed.join(", ")}.${note}` };
}
