import type { OpxConfig, PackageJson } from "@allons-y/opx";
import { isTaskEnabled, isValidPluginName, normalizeDetectorId } from "@allons-y/opx";

import { catalogEntryForPackage, isPackageId, isShipped, isStaticTask, tasksFor, type TaskKind } from "./plugin-catalog.js";

export type ToggleResult = { config: OpxConfig; message: string } | { error: string };

const DYNAMIC_TASKS: TaskKind[] = ["lint", "build"];

/** A toggle target after resolving package ids and installed names. */
export type ToggleTarget =
	| { kind: "catalog"; name: string }
	| { kind: "package"; name: string }
	| { kind: "unknown"; name: string };

/**
 * Resolve what a name refers to.
 *
 * A first-party package id becomes its catalog short name. A third-party id,
 * or a short name installed as `opx-plugin-<name>`, becomes the package id the
 * loader can import.
 *
 * @param name - A short name or package id from the command line.
 * @param hostPkg - The host project's `package.json`.
 */
export function resolveTarget(name: string, hostPkg: PackageJson): ToggleTarget {
	const entry = catalogEntryForPackage(name);
	if (entry) return { kind: "catalog", name: entry.shortName };
	if (isShipped(name) || isStaticTask(name)) return { kind: "catalog", name };
	if (isPackageId(name) && isValidPluginName(name)) return { kind: "package", name };
	const installed = isPackageId(name) ? null : normalizeDetectorId(name, hostPkg);
	if (installed) return { kind: "package", name: installed };
	return { kind: "unknown", name };
}

/** Resolve which tasks a toggle applies to, or an error if the request is invalid. */
function resolveTasks(name: string, provided: TaskKind[], requested: TaskKind[] | undefined): TaskKind[] | string {
	if (!requested || requested.length === 0) return provided;
	const unsupported = requested.filter((task) => !provided.includes(task));
	if (unsupported.length > 0) return `"${name}" does not provide: ${unsupported.join(", ")}.`;
	return requested;
}

/** Tasks a third-party plugin applies to: the requested ones, its concerns, or, when disabling, wherever it's set. */
function packageTasks(config: OpxConfig, name: string, enable: boolean, requested: TaskKind[] | undefined, concerns: TaskKind[] | undefined): TaskKind[] | string {
	if (concerns) return resolveTasks(name, concerns, requested);
	if (requested && requested.length > 0) return requested;
	if (!enable) return DYNAMIC_TASKS.filter((task) => typeof config[task]?.[name] !== "undefined");
	return `can't tell which task "${name}" runs in. Install it first, or pass --task lint or --task build.`;
}

/**
 * Enable or disable a plugin in the config.
 *
 * Static tasks (`release`, `test`) are booleans; everything else is written
 * into the dynamic tasks the plugin actually provides.
 *
 * @param config - The current config.
 * @param name - A short name or package id.
 * @param enable - `true` to enable, `false` to disable.
 * @param hostPkg - The host project's `package.json`.
 * @param requested - Restrict to these tasks.
 * @param concerns - The dynamic tasks a third-party plugin's detectors declare, when it could be loaded.
 */
export function toggle(config: OpxConfig, name: string, enable: boolean, hostPkg: PackageJson, requested?: TaskKind[], concerns?: TaskKind[]): ToggleResult {
	const target = resolveTarget(name, hostPkg);
	if (target.kind === "unknown") {
		return { error: `unknown plugin "${name}". Use a short name like js, ts, md, json, or a full package id.` };
	}
	const key = target.name;

	if (isStaticTask(key)) {
		if (enable && !isShipped(key)) return { error: `"${key}" is not available yet.` };
		// Settings count as on, so enabling never replaces them.
		if (isTaskEnabled(config[key]) === enable) return { config, message: `"${key}" is already ${enable ? "enabled" : "disabled"}.` };
		return { config: { ...config, [key]: enable }, message: `${enable ? "enabled" : "disabled"} "${key}".` };
	}

	const resolved = target.kind === "catalog" ? resolveTasks(key, tasksFor(key), requested) : packageTasks(config, key, enable, requested, concerns);
	if (typeof resolved === "string") return { error: resolved };

	// Disabling by package id also clears entries written under that id, in any task.
	const stale = !enable && name !== key ? [name] : [];
	const staleTasks = requested?.length ? [] : DYNAMIC_TASKS.filter((task) => stale.some((k) => typeof config[task]?.[k] !== "undefined"));
	const tasks = DYNAMIC_TASKS.filter((task) => resolved.includes(task) || staleTasks.includes(task));
	if (tasks.length === 0) {
		return enable ? { error: `"${key}" provides no lint or build task.` } : { config, message: `"${key}" is already disabled.` };
	}

	const verb = enable ? "enabled" : "disabled";
	const changed = tasks.filter((task) =>
		enable ? config[task]?.[key] !== true : [key, ...stale].some((k) => typeof config[task]?.[k] !== "undefined"));
	if (changed.length === 0) {
		return { config, message: `"${key}" is already ${verb} in ${tasks.join(", ")}.` };
	}

	const next: OpxConfig = { ...config };
	for (const task of changed) {
		const entries = { ...(config[task] ?? {}) };
		if (enable) entries[key] = true;
		else for (const k of [key, ...stale]) delete entries[k];
		next[task] = entries;
	}
	return { config: next, message: `${verb} "${key}" in ${changed.join(", ")}.` };
}
