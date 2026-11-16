import { jest } from "@jest/globals";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import type { CoverageTotals } from "./c8.js";
import { runTest, shortfalls, type TestDeps } from "./runner.js";

type Call = { command: string; args: string[]; cwd: string };

/** A context that records what the plugin writes and logs. */
function setup(test: unknown, exec: { code?: number; error?: Error }, totals?: CoverageTotals) {
	const out: string[] = [];
	const err: string[] = [];
	const calls: Call[] = [];
	const ctx = {
		cwd: "/repo",
		config: { version: 1, test },
		write: (chunk: string) => out.push(chunk),
		logger: { error: (line: string) => err.push(line) },
	} as unknown as DetectorContext;
	const readTotals = jest.fn<TestDeps["readTotals"]>(() => totals);
	const deps: TestDeps = {
		exec: async (command, args, cwd) => {
			calls.push({ command, args, cwd });
			if (exec.error) throw exec.error;
			return exec.code ?? 0;
		},
		readTotals,
		resolveC8: () => "/c8/bin/c8.js",
	};
	return { ctx, deps, calls, readTotals, text: () => out.join(""), errors: () => err.join("\n") };
}

const totals = (over: Partial<CoverageTotals> = {}): CoverageTotals => ({ lines: 99, statements: 99, functions: 95, branches: 95, ...over });

describe("runTest without coverage", () => {
	it("runs node --test in the repository and passes the other arguments through", async () => {
		const { ctx, deps, calls, readTotals, text } = setup(true, {});

		const code = await runTest(ctx, ["src/a.test.js", "--test-name-pattern=x"], deps);

		expect(code).toBe(0);
		expect(calls).toEqual([{ command: process.execPath, args: ["--test", "--test-reporter=spec", "src/a.test.js", "--test-name-pattern=x"], cwd: "/repo" }]);
		expect(readTotals).not.toHaveBeenCalled();
		expect(text()).toContain("Tests passed");
	});

	it("keeps a reporter the user chose", async () => {
		const { ctx, deps, calls } = setup(true, {});

		await runTest(ctx, ["--test-reporter=dot"], deps);

		expect(calls[0]?.args).toEqual(["--test", "--test-reporter=dot"]);
	});

	it("returns the test run's exit code and says what to do", async () => {
		const { ctx, deps, text, errors } = setup(true, { code: 7 });

		expect(await runTest(ctx, [], deps)).toBe(7);

		expect(errors()).toContain("Tests failed");
		expect(errors()).toContain("exit code 7");
		expect(text()).toContain("Fix the failing tests");
		expect(text()).not.toContain("Tests passed");
	});

	it("fails with 1 when the tests can't be started", async () => {
		const { ctx, deps, errors } = setup(true, { error: new Error("spawn ENOENT") });

		expect(await runTest(ctx, [], deps)).toBe(1);
		expect(errors()).toContain("Could not run the tests");
		expect(errors()).toContain("spawn ENOENT");
	});

	it("warns about thresholds that aren't percentages, even with coverage off", async () => {
		const { ctx, deps, errors } = setup({ coverage: { lines: 120 } }, {});

		expect(await runTest(ctx, [], deps)).toBe(0);
		expect(errors()).toContain("Ignored test.coverage.lines");
	});
});

describe("runTest --coverage", () => {
	it("wraps node --test in c8 and writes the report where it reads it", async () => {
		const { ctx, deps, calls, readTotals } = setup({ coverage: { lines: 98 } }, {}, totals());

		await runTest(ctx, ["--coverage", "src"], deps);

		const reportDir = join("/repo", "coverage");
		expect(calls).toEqual([
			{ command: process.execPath, args: ["/c8/bin/c8.js", "--reporter=json-summary", "--reports-dir", reportDir, process.execPath, "--test", "--test-reporter=spec", "src"], cwd: "/repo" },
		]);
		expect(readTotals).toHaveBeenCalledWith(join(reportDir, "coverage-summary.json"));
	});

	it("passes when every threshold is met, including exactly", async () => {
		const { ctx, deps, text } = setup({ coverage: { lines: 99, branches: 95 } }, {}, totals());

		expect(await runTest(ctx, ["--coverage"], deps)).toBe(0);
		expect(text()).toContain("Coverage meets the thresholds");
	});

	it("fails with 1 and names each metric below its threshold", async () => {
		const { ctx, deps, text, errors } = setup({ coverage: { lines: 98, branches: 94, functions: 90 } }, {}, totals({ lines: 97.5, branches: 80 }));

		expect(await runTest(ctx, ["--coverage"], deps)).toBe(1);

		expect(errors()).toContain("lines 97.5% < 98%, branches 80% < 94%");
		expect(errors()).not.toContain("functions");
		expect(text()).toContain("lower the numbers under `test.coverage`");
	});

	it("shows the table, with the required column only for metrics that have a threshold", async () => {
		const { ctx, deps, text } = setup({ coverage: { lines: 98 } }, {}, totals());

		await runTest(ctx, ["--coverage"], deps);

		expect(text()).toMatch(/lines\s+99%\s+98%/);
		expect(text()).toMatch(/branches\s+95%\s+–/);
	});

	it("reports without failing when no thresholds are set, and says how to set them", async () => {
		const { ctx, deps, text } = setup(true, {}, totals({ lines: 1 }));

		expect(await runTest(ctx, ["--coverage"], deps)).toBe(0);
		expect(text()).toContain("Coverage reported");
		expect(text()).toContain('"coverage": { "lines": 98, "branches": 94 }');
	});

	it("skips the threshold check when tests fail, and returns their exit code", async () => {
		const { ctx, deps, readTotals } = setup({ coverage: { lines: 98 } }, { code: 1 }, totals({ lines: 0 }));

		expect(await runTest(ctx, ["--coverage"], deps)).toBe(1);
		expect(readTotals).not.toHaveBeenCalled();
	});

	it("fails when c8 wrote no report", async () => {
		const { ctx, deps, errors, text } = setup({ coverage: { lines: 98 } }, {}, undefined);

		expect(await runTest(ctx, ["--coverage"], deps)).toBe(1);
		expect(errors()).toContain("No coverage report");
		expect(text()).toContain(".c8rc.json");
	});

	it("fails with 1 when c8 can't be found", async () => {
		const { ctx, deps, errors } = setup(true, {}, totals());
		deps.resolveC8 = () => {
			throw new Error("Cannot find module c8");
		};

		expect(await runTest(ctx, ["--coverage"], deps)).toBe(1);
		expect(errors()).toContain("Cannot find module c8");
	});
});

describe("shortfalls", () => {
	it("skips metrics without a threshold", () => {
		expect(shortfalls(totals({ lines: 10 }), {})).toEqual([]);
	});
});
