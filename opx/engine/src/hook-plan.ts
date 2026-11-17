import type { Detector } from "./detector.js";
import { hookLine } from "./hooks.js";

/** What to write for one git hook. */
export type HookPlan = {
	/** The git hook, such as `commit-msg`. */
	name: string;
	/** The line to install, from {@link hookLine}. */
	line: string;
};

/**
 * Merge the hooks that detectors declare into one line per hook.
 *
 * The first declaration sets the `opx` arguments. The line blocks when any
 * detector that declared the hook does.
 *
 * @param detectors - The enabled detectors.
 * @returns One plan per hook name, in the order first declared.
 */
export function planHooks(detectors: Detector[]): HookPlan[] {
	const merged = new Map<string, { args: string[]; blocking: boolean }>();
	for (const detector of detectors) {
		for (const [name, { args, blocking = false }] of Object.entries(detector.hooks ?? {})) {
			const seen = merged.get(name);
			merged.set(name, { args: seen?.args ?? args, blocking: (seen?.blocking ?? false) || blocking });
		}
	}
	return [...merged].map(([name, { args, blocking }]) => ({ name, line: hookLine(args, blocking) }));
}
