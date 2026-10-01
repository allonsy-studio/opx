import { applyDeferral, defaultSkipUntilDate, diff, isDeferred } from "./diff.js";
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

describe("isDeferred", () => {
	const state = (over: Partial<OpxState["deferrals"][string]> = {}): OpxState => ({
		version: 1,
		deferrals: { js: { branch: "main", skipUntilDate: "2026-01-02", reason: "later", ...over } },
	});

	it("is active through the skip date, inclusive", () => {
		expect(isDeferred(state(), "js", "main", "2026-01-01")).toBe(true);
		expect(isDeferred(state(), "js", "main", "2026-01-02")).toBe(true);
	});

	it("expires the day after the skip date", () => {
		expect(isDeferred(state(), "js", "main", "2026-01-03")).toBe(false);
	});

	it("never applies on a different branch", () => {
		expect(isDeferred(state(), "js", "feature", "2026-01-01")).toBe(false);
	});

	it("is false for a plugin with no deferral", () => {
		expect(isDeferred(state(), "md", "main", "2026-01-01")).toBe(false);
	});

	it("defaults to today's date", () => {
		const today = new Date().toISOString().slice(0, 10);
		expect(isDeferred(state({ skipUntilDate: today }), "js", "main")).toBe(true);
		expect(isDeferred(state({ skipUntilDate: "2000-01-01" }), "js", "main")).toBe(false);
	});
});

describe("diff and disabled plugins", () => {
	it("treats a plugin set to false as not enabled", async () => {
		const result = await diff([fakeDetector("js", true)], ctx({ lint: { js: false } }), "2026-01-01");
		expect(result.entries[0]?.enabled).toBe(false);
		expect(result.needsPrompt).toHaveLength(1);
	});

	it("does not re-prompt on the skip date, but does the day after", async () => {
		const deferrals = { js: { branch: "main", skipUntilDate: "2026-01-02", reason: "later" } };
		expect((await diff([fakeDetector("js", true)], ctx({ deferrals }), "2026-01-02")).needsPrompt).toHaveLength(0);
		expect((await diff([fakeDetector("js", true)], ctx({ deferrals }), "2026-01-03")).needsPrompt).toHaveLength(1);
	});

	it("ignores a deferral recorded on another branch", async () => {
		const deferrals = { js: { branch: "other", skipUntilDate: "2026-01-02", reason: "later" } };
		expect((await diff([fakeDetector("js", true)], ctx({ deferrals, branch: "main" }), "2026-01-01")).needsPrompt).toHaveLength(1);
	});
});
