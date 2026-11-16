import type { Detector, HookPlan } from "@allons-y/opx";
import { POST_COMMIT_LINE, installHook, planHooks, removeHook } from "@allons-y/opx";

import { colors } from "./colors.js";

/** What happened to one hook file. */
export type HookReport = {
	/** The hook file, such as `.husky/commit-msg`. */
	file: string;
	/** `created` or `updated` when opx wrote the file, `removed` when it took its line out, `deleted` when it took the last line, and `unchanged` when the line was already there. */
	status: "created" | "updated" | "removed" | "deleted" | "unchanged";
};

/** The line `opx init` installs for the post-commit nudge, which no plugin's removal touches. */
const isNudge = (plan: HookPlan): boolean => plan.name === "post-commit" && plan.line === POST_COMMIT_LINE;

/**
 * Install the hooks the detectors declare.
 *
 * @param cwd - The repository root.
 * @param detectors - The enabled detectors.
 * @param skip - Hooks already in place, which are left alone.
 */
export function installHooks(cwd: string, detectors: Detector[], skip: Detector[] = []): HookReport[] {
	const already = new Map(planHooks(skip).map((plan) => [plan.name, plan.line]));
	return planHooks(detectors)
		.filter((plan) => already.get(plan.name) !== plan.line)
		.map((plan) => {
			const result = installHook(cwd, plan.name, plan.line);
			const status = result.created ? "created" : result.changed ? "updated" : "unchanged";
			return { file: `.husky/${plan.name}`, status };
		});
}

/**
 * Bring the hooks in line with a change in which detectors are enabled.
 *
 * Installs or updates hooks the change added or altered, and removes the line
 * opx wrote for a hook that no detector declares any more. Never removes the
 * post-commit nudge or a line opx didn't write.
 *
 * @param cwd - The repository root.
 * @param before - The detectors enabled before the change.
 * @param after - The detectors enabled after it.
 */
export function syncHooks(cwd: string, before: Detector[], after: Detector[]): HookReport[] {
	const reports = installHooks(cwd, after, before);
	const remaining = new Set(planHooks(after).map((plan) => plan.name));
	for (const plan of planHooks(before)) {
		if (remaining.has(plan.name) || isNudge(plan)) continue;
		const result = removeHook(cwd, plan.name, plan.line);
		if (result.removed) reports.push({ file: `.husky/${plan.name}`, status: result.deleted ? "deleted" : "removed" });
	}
	return reports;
}

/** One status line for a hook: `✔` when opx wrote or removed something, a dim `–` when there was nothing to do. */
export function describeHook({ file, status }: HookReport): string {
	if (status === "unchanged") return `  ${colors.dim(`– ${file} already set up`)}`;
	const what = { created: "created", updated: "updated", removed: "opx line removed", deleted: "removed" }[status];
	return `  ${colors.green("✔")} ${file} ${colors.dim(what)}`;
}
