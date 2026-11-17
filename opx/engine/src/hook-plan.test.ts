import type { Detector } from "./detector.js";
import { planHooks } from "./hook-plan.js";
import { hookLine } from "./hooks.js";

const plugin = (hooks: Detector["hooks"]): Detector => ({ hooks }) as Detector;

describe("planHooks", () => {
	it("plans nothing for plugins that declare no hooks", () => {
		expect(planHooks([plugin(undefined), plugin({})])).toEqual([]);
	});

	it("plans one line per hook, blocking only when asked", () => {
		const plans = planHooks([plugin({ "commit-msg": { args: ["hook", "commit-msg"], blocking: true }, "pre-push": { args: ["hook", "pre-push"] } })]);
		expect(plans).toEqual([
			{ name: "commit-msg", line: hookLine(["hook", "commit-msg"], true) },
			{ name: "pre-push", line: hookLine(["hook", "pre-push"]) },
		]);
	});

	it("merges plugins that declare the same hook: the first sets the arguments and any blocking one makes it block", () => {
		const plans = planHooks([
			plugin({ "commit-msg": { args: ["hook", "commit-msg"] } }),
			plugin({ "commit-msg": { args: ["hook", "other"], blocking: true } }),
		]);
		expect(plans).toEqual([{ name: "commit-msg", line: hookLine(["hook", "commit-msg"], true) }]);
	});
});
