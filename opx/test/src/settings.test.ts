import { coverageSettings } from "./settings.js";

describe("coverageSettings", () => {
	it("reads each metric's threshold from test.coverage", () => {
		expect(coverageSettings({ coverage: { lines: 98, branches: 94, functions: 90, statements: 97.5 } })).toEqual({
			thresholds: { lines: 98, branches: 94, functions: 90, statements: 97.5 },
			invalid: [],
		});
	});

	it.each([true, false, undefined, null, "./test.json", [], {}, { coverage: true }])("sets no thresholds for %j", (setting) => {
		expect(coverageSettings(setting)).toEqual({ thresholds: {}, invalid: [] });
	});

	it("ignores and reports values that aren't a percentage, and unknown metrics", () => {
		expect(coverageSettings({ coverage: { lines: 101, branches: "94", functions: -1, files: 80, statements: 0 } })).toEqual({
			thresholds: { statements: 0 },
			invalid: ["test.coverage.lines", "test.coverage.branches", "test.coverage.functions", "test.coverage.files"],
		});
	});
});
