import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { combine, describeThresholds, formatPercent, parseLcov, passes, readRoot, readSummaries, renderReport } from "./coverage-report.js";

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Coverage counts with the same total for every metric. */
const totals = (covered, total, overrides = {}) => ({
	lines: { covered, total },
	branches: { covered, total },
	functions: { covered, total },
	statements: { covered, total },
	...overrides,
});

const THRESHOLDS = { lines: 98, statements: 98, branches: 94, functions: 94 };

describe("readSummaries", () => {
	it("reads each package with a summary, named by its package.json, sorted", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-cov-"));
		dirs.push(dir);
		for (const [folder, name] of [["release", "@s/release"], ["cli", "@s/cli"], ["docs", "@s/docs"]]) {
			mkdirSync(join(dir, folder));
			writeFileSync(join(dir, folder, "package.json"), JSON.stringify({ name }));
		}
		for (const folder of ["release", "cli"]) {
			mkdirSync(join(dir, folder, "coverage"));
			writeFileSync(join(dir, folder, "coverage", "coverage-summary.json"), JSON.stringify({ total: totals(9, 10) }));
		}
		assert.deepEqual(readSummaries(dir).map((row) => row.name), ["@s/cli", "@s/release"]);
	});
});

describe("combine", () => {
	it("adds counts, so a big package weighs more than a small one", () => {
		const combined = combine([{ name: "a", total: totals(90, 100) }, { name: "b", total: totals(10, 10) }]);
		assert.deepEqual(combined.lines, { covered: 100, total: 110 });
	});
});

describe("formatPercent", () => {
	it("rounds down so a miss never shows as the minimum", () => {
		assert.equal(formatPercent(93.96), "93.9%");
		assert.equal(formatPercent(100), "100%");
		assert.equal(formatPercent(98), "98%");
	});
});

describe("describeThresholds", () => {
	it("groups metrics that share a minimum", () => {
		assert.equal(describeThresholds(THRESHOLDS), "98% of lines and statements and 94% of branches and functions");
	});
});

describe("renderReport", () => {
	it("prints a row per package, flags a miss, and adds a combined row", () => {
		const report = renderReport(
			[
				{ name: "@s/cli", total: totals(995, 1000) },
				{ name: "@s/release", total: totals(990, 1000, { branches: { covered: 930, total: 1000 } }) },
			],
			THRESHOLDS,
		);
		assert.equal(
			report,
			[
				"## Coverage",
				"",
				"| Package | Lines | Branches | Functions | Statements | Status |",
				"| --- | ---: | ---: | ---: | ---: | :---: |",
				"| `@s/cli` | 99.5% | 99.5% | 99.5% | 99.5% | ✅ |",
				"| `@s/release` | 99% | **93%** ⚠️ | 99% | 99% | ❌ |",
				"| **All** | 99.2% | 96.2% | 99.2% | 99.2% | |",
				"",
				"Each row must reach 98% of lines and statements and 94% of branches and functions, and every file outside the workspaces needs tests. `yarn coverage` enforces it.",
				"",
			].join("\n"),
		);
	});

	it("counts nothing to cover as covered", () => {
		assert.match(renderReport([{ name: "@s/empty", total: totals(0, 0) }], THRESHOLDS), /`@s\/empty` \| 100% \| 100% \| 100% \| 100% \| ✅/);
	});

	it("says so when there are no reports", () => {
		assert.equal(renderReport([], THRESHOLDS), "## Coverage\n\nNo coverage reports found.\n");
	});
});

describe("parseLcov", () => {
	it("sums every file's counts and lists the files, with statements following lines", () => {
		const lcov = ["SF:/r/scripts/a.js", "FNF:2", "FNH:2", "BRF:4", "BRH:3", "LF:10", "LH:9", "end_of_record", "SF:/r/scripts/b.js", "FNF:1", "FNH:0", "LF:5", "LH:5", "end_of_record", ""].join("\n");
		assert.deepEqual(parseLcov(lcov), {
			total: { lines: { total: 15, covered: 14 }, statements: { total: 15, covered: 14 }, branches: { total: 4, covered: 3 }, functions: { total: 3, covered: 2 } },
			files: ["/r/scripts/a.js", "/r/scripts/b.js"],
		});
	});
});

describe("readRoot", () => {
	/** A repo root with code outside the workspaces and, optionally, an lcov file covering some of it. */
	function root(covered) {
		const dir = mkdtempSync(join(tmpdir(), "opx-cov-root-"));
		dirs.push(dir);
		const files = ["scripts/a.js", "scripts/a.test.js", "scripts/b.js", "scripts/smoke.js", "scripts/notes.md", "tools/c.js", "configs/d.js", "opx/e/f.js"];
		for (const file of files) {
			mkdirSync(join(dir, file, ".."), { recursive: true });
			writeFileSync(join(dir, file), "");
		}
		if (covered) writeFileSync(join(dir, "coverage.lcov"), covered.map((file) => `SF:${join(dir, file)}\nLF:1\nLH:1\nend_of_record`).join("\n"));
		return dir;
	}

	it("names code outside the workspaces that no test loaded", () => {
		const row = readRoot(root(["scripts/a.js"]));
		assert.equal(row?.name, ".");
		assert.deepEqual(row?.untested, ["scripts/b.js", "tools/c.js"]);
		assert.deepEqual(row?.total.lines, { covered: 1, total: 1 });
	});

	it("is absent when the root tests weren't run with coverage", () => {
		assert.equal(readRoot(root()), undefined);
	});
});

describe("passes", () => {
	it("needs every minimum met and no untested files", () => {
		assert.equal(passes({ name: "a", total: totals(99, 100) }, THRESHOLDS), true);
		assert.equal(passes({ name: "a", total: totals(97, 100) }, THRESHOLDS), false);
		assert.equal(passes({ name: "a", total: totals(99, 100), untested: ["b.js"] }, THRESHOLDS), false);
	});
});

describe("renderReport with untested files", () => {
	it("flags a row with untested files and names them under the table", () => {
		const report = renderReport([{ name: ".", total: totals(99, 100), untested: ["scripts/shared.js"] }], THRESHOLDS);
		assert.match(report, /\| `.` \| 99% \| 99% \| 99% \| 99% \| ❌ \|/);
		assert.match(report, /⚠️ No tests: `scripts\/shared\.js`\./);
	});
});
