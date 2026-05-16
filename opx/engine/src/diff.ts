import type { Detector, DetectorContext, OpxState } from "./detector.js";

export type DiffEntry = {
	detector: Detector;
	matched: boolean;
	enabled: boolean;
	deferred: boolean;
	deferralExpired: boolean;
	needsPrompt: boolean;
};

export type DiffResult = {
	entries: DiffEntry[];
	needsPrompt: DiffEntry[];
};

/**
 * Reconcile detector matches against config + state.
 *   - enabled: the detector's short name is present in config.lint.
 *   - deferred: state has a deferral whose branch matches AND date hasn't expired.
 *   - needsPrompt: detector matches files, is not enabled, and not currently deferred.
 */
export async function diff(
	detectors: Detector[],
	ctx: DetectorContext,
	today: string = new Date().toISOString().slice(0, 10),
): Promise<DiffResult> {
	const enabledSet = new Set(ctx.config.lint);
	const entries: DiffEntry[] = [];

	for (const detector of detectors) {
		const matched = await detector.detect(ctx);
		const enabled = enabledSet.has(detector.shortName);
		const deferral = ctx.state.deferrals[detector.shortName];
		const deferred = !!deferral && deferral.branch === ctx.branch && deferral.skipUntilDate >= today;
		const deferralExpired = !!deferral && !deferred;

		const needsPrompt = matched && !enabled && !deferred;
		entries.push({ detector, matched, enabled, deferred, deferralExpired, needsPrompt });
	}

	return {
		entries,
		needsPrompt: entries.filter((e) => e.needsPrompt),
	};
}

/**
 * Compute a default skipUntilDate for a "later" choice: today (the deferral
 * expires when the calendar day rolls over). The diff function treats a deferral
 * as active while skipUntilDate >= today, so storing today suppresses for the
 * rest of the day on the current branch.
 */
export function defaultSkipUntilDate(today: string = new Date().toISOString().slice(0, 10)): string {
	return today;
}

export function applyDeferral(state: OpxState, shortName: string, branch: string, skipUntilDate: string): OpxState {
	return {
		...state,
		deferrals: {
			...state.deferrals,
			[shortName]: { branch, skipUntilDate, reason: "later" },
		},
	};
}
