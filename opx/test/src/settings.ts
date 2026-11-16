/** The coverage metrics c8 reports, each as a percentage from 0 to 100. */
export const METRICS = ["lines", "statements", "functions", "branches"] as const;

/** One coverage metric. */
export type Metric = (typeof METRICS)[number];

/** The minimum percentage required for each metric; a missing metric is not checked. */
export type Thresholds = Partial<Record<Metric, number>>;

/** What `.opx/config.json` asks for under `test.coverage`. */
export type CoverageSettings = {
	/** The minimums to enforce. */
	thresholds: Thresholds;
	/** Settings that were ignored, each as `test.coverage.<key>`, because they aren't a percentage. */
	invalid: string[];
};

/**
 * Read the coverage thresholds from the `test` setting.
 *
 * @param setting - The task's value in `.opx/config.json`, such as `{ "coverage": { "lines": 98 } }`.
 * @returns The valid thresholds, and the keys that were ignored.
 */
export function coverageSettings(setting: unknown): CoverageSettings {
	const result: CoverageSettings = { thresholds: {}, invalid: [] };
	if (typeof setting !== "object" || setting === null) return result;
	const coverage = (setting as { coverage?: unknown }).coverage;
	if (typeof coverage !== "object" || coverage === null) return result;
	for (const [key, value] of Object.entries(coverage)) {
		if ((METRICS as readonly string[]).includes(key) && typeof value === "number" && value >= 0 && value <= 100) {
			result.thresholds[key as Metric] = value;
		} else {
			result.invalid.push(`test.coverage.${key}`);
		}
	}
	return result;
}
