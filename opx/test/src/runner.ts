import { join } from "node:path";

import { uiFor, type DetectorContext } from "@allons-y/opx";

import { exec, readTotals, resolveC8, type CoverageTotals } from "./c8.js";
import { METRICS, coverageSettings, type Thresholds } from "./settings.js";

/** The outside world the runner touches; tests pass their own. */
export type TestDeps = {
	/** Run a program and stream its output; resolves to its exit code. */
	exec: typeof exec;
	/** Read c8's totals from its summary file. */
	readTotals: typeof readTotals;
	/** Find c8's executable. */
	resolveC8: typeof resolveC8;
};

const defaultDeps: TestDeps = { exec, readTotals, resolveC8 };

/** Where c8 writes its report, relative to the repository root. */
export const REPORT_DIR = "coverage";

/** The flag that turns coverage on. Everything else goes to `node --test`. */
export const COVERAGE_FLAG = "--coverage";

/** The metrics that fall short of their threshold, as `lines 97.1% < 98%`. */
export function shortfalls(totals: CoverageTotals, thresholds: Thresholds): string[] {
	return METRICS.flatMap((metric) => {
		const min = thresholds[metric];
		return min !== undefined && totals[metric] < min ? [`${metric} ${totals[metric]}% < ${min}%`] : [];
	});
}

/**
 * Run the project's tests with `node --test`, and with `--coverage`, under c8.
 *
 * Arguments other than `--coverage` go to `node --test`. With coverage on, the
 * `test.coverage` thresholds in `.opx/config.json` decide whether the run passes.
 *
 * @param ctx - The detector context.
 * @param args - Paths and flags from the command line.
 * @param deps - The outside world, for tests.
 * @returns `0` when tests pass and coverage meets its thresholds; the test run's exit code when tests fail; `1` otherwise.
 */
export async function runTest(ctx: DetectorContext, args: string[], deps: TestDeps = defaultDeps): Promise<number> {
	const ui = uiFor(ctx);
	const coverage = args.includes(COVERAGE_FLAG);
	const forwarded = args.filter((arg) => arg !== COVERAGE_FLAG);
	// Node falls back to TAP when output isn't a terminal, which is what opx pipes; the spec reporter reads better.
	const reporter = forwarded.some((arg) => arg.startsWith("--test-reporter")) ? [] : ["--test-reporter=spec"];
	const nodeArgs = ["--test", ...reporter, ...forwarded];
	const { thresholds, invalid } = coverageSettings(ctx.config.test);
	const reportDir = join(ctx.cwd, REPORT_DIR);

	ui.heading(coverage ? "opx test · coverage" : "opx test");
	for (const key of invalid) ui.warn(`Ignored ${key}`, "expected a number from 0 to 100");

	const command = process.execPath;
	let commandArgs = nodeArgs;
	try {
		if (coverage) {
			commandArgs = [deps.resolveC8(ctx.cwd), "--reporter=json-summary", "--reports-dir", reportDir, process.execPath, ...nodeArgs];
		}
		ui.step("Running tests", `node ${nodeArgs.join(" ")}`);
		const code = await deps.exec(command, commandArgs, ctx.cwd, ctx.write);
		ui.gap();
		if (code !== 0) {
			ui.fail("Tests failed", `exit code ${code}`);
			ui.hint("Fix the failing tests above, then run `opx test` again.");
			return code;
		}
		ui.ok("Tests passed");
	} catch (err) {
		ui.fail("Could not run the tests", (err as Error).message);
		return 1;
	}
	if (!coverage) return 0;

	const totals = deps.readTotals(join(reportDir, "coverage-summary.json"));
	if (!totals) {
		ui.fail("No coverage report", `expected ${join(REPORT_DIR, "coverage-summary.json")}`);
		ui.hint("Check that c8 can run in this project, and that `.c8rc.json` doesn't change `reportsDir`.");
		return 1;
	}

	const missed = shortfalls(totals, thresholds);
	ui.table(
		["Coverage", "Covered", "Required"],
		METRICS.map((metric) => [metric, `${totals[metric]}%`, thresholds[metric] === undefined ? "–" : `${thresholds[metric]}%`]),
	);
	ui.gap();
	if (missed.length > 0) {
		ui.fail("Coverage is below the threshold", missed.join(", "));
		ui.hint("Add tests, or lower the numbers under `test.coverage` in .opx/config.json.");
		return 1;
	}
	if (Object.keys(thresholds).length === 0) {
		ui.ok("Coverage reported");
		ui.hint('To fail below a minimum, set `"test": { "coverage": { "lines": 98, "branches": 94 } }` in .opx/config.json.');
	} else {
		ui.ok("Coverage meets the thresholds");
	}
	return 0;
}
