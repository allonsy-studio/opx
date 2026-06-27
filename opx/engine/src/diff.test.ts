import { applyDeferral, defaultSkipUntilDate, diff } from "./diff.js";
import type { Detector, DetectorContext, OpxState } from "./detector.js";

function fakeDetector(shortName: string, matched: boolean): Detector {
	return {
		id: `@allons-y/opx-lint-${shortName}`,
		shortName,
		displayName: shortName,
		concern: "lint",
		detect: () => matched,
		describe: () => ({ summary: "", bundledDeps: [] }),
	};
}

function ctx(partial: { lint?: Record<string, unknown>; deferrals?: OpxState["deferrals"]; branch?: string }): DetectorContext {
	return {
		config: { version: 1, lint: partial.lint ?? {} },
		state: { version: 1, deferrals: partial.deferrals ?? {} },
		branch: partial.branch ?? "main",
	} as unknown as DetectorContext;
}

describe("diff", () => {
	it("flags a matched, not-enabled, not-deferred detector as needsPrompt", async () => {
		const result = await diff([fakeDetector("js", true)], ctx({}), "2026-01-01");
		expect(result.entries[0]).toMatchObject({ matched: true, enabled: false, deferred: false, needsPrompt: true });
		expect(result.needsPrompt).toHaveLength(1);
	});

	it("does not prompt when the detector is already enabled", async () => {
		const result = await diff([fakeDetector("js", true)], ctx({ lint: { js: true } }), "2026-01-01");
		expect(result.entries[0]).toMatchObject({ enabled: true, needsPrompt: false });
		expect(result.needsPrompt).toHaveLength(0);
	});

	it("suppresses a prompt for an active deferral on the same branch", async () => {
		const deferrals = { js: { branch: "main", skipUntilDate: "2026-12-31", reason: "later" } };
		const result = await diff([fakeDetector("js", true)], ctx({ deferrals, branch: "main" }), "2026-06-01");
		expect(result.entries[0]).toMatchObject({ deferred: true, deferralExpired: false, needsPrompt: false });
	});

	it("treats an expired deferral as expired and re-prompts", async () => {
		const deferrals = { js: { branch: "main", skipUntilDate: "2026-01-01", reason: "later" } };
		const result = await diff([fakeDetector("js", true)], ctx({ deferrals, branch: "main" }), "2026-06-01");
		expect(result.entries[0]).toMatchObject({ deferred: false, deferralExpired: true, needsPrompt: true });
	});

	it("does not prompt for a detector that does not match", async () => {
		const result = await diff([fakeDetector("css", false)], ctx({}), "2026-01-01");
		expect(result.entries[0]).toMatchObject({ matched: false, needsPrompt: false });
	});
});

describe("defaultSkipUntilDate / applyDeferral", () => {
	it("returns the given day", () => {
		expect(defaultSkipUntilDate("2026-06-01")).toBe("2026-06-01");
	});

	it("records a deferral without mutating the input state", () => {
		const state: OpxState = { version: 1, deferrals: {} };
		const next = applyDeferral(state, "js", "feat", "2026-06-01");
		expect(next.deferrals.js).toEqual({ branch: "feat", skipUntilDate: "2026-06-01", reason: "later" });
		expect(state.deferrals).toEqual({});
	});
});
