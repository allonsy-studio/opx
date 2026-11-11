/**
 * Turn coverage into one Markdown table for the pull request comment and the job
 * summary: a row per package, a `.` row for the code outside the workspaces, and
 * a combined row, each checked against the minimums Jest enforces.
 *
 * Reads `opx/<package>/coverage/coverage-summary.json` (Jest's `json-summary`
 * reporter, in CI) and `coverage.lcov` (`yarn coverage:root`).
 *
 * Usage: `node scripts/coverage-report.js [--check] > code-coverage-results.md`.
 * `--check` exits 1 when any row misses a minimum or a script has no tests.
 */
import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** @typedef {{ total: number, covered: number }} Metric */
/** @typedef {{ lines: Metric, branches: Metric, functions: Metric, statements: Metric }} Totals */
/** @typedef {{ name: string, total: Totals, untested?: string[] }} Row */

const METRICS = /** @type {const} */ (["lines", "branches", "functions", "statements"]);

/**
 * Read every package's coverage summary, named by its package.json.
 * @param {string} dir - The folder that holds the packages.
 * @returns {Row[]} Sorted by package name.
 */
export function readSummaries(dir) {
	return readdirSync(dir)
		.filter((name) => existsSync(join(dir, name, "coverage", "coverage-summary.json")))
		.map((name) => {
			const pkg = JSON.parse(readFileSync(join(dir, name, "package.json"), "utf8"));
			const summary = JSON.parse(readFileSync(join(dir, name, "coverage", "coverage-summary.json"), "utf8"));
			return { name: pkg.name ?? name, total: summary.total };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read an lcov file, such as Node's test coverage writes, into totals and the files it covers.
 * lcov has no statement counts, so statements follow lines.
 * @param {string} source - The lcov text.
 * @returns {{ total: Totals, files: string[] }}
 */
export function parseLcov(source) {
	const sums = { LF: 0, LH: 0, BRF: 0, BRH: 0, FNF: 0, FNH: 0 };
	const files = [];
	for (const line of source.split(/\r?\n/)) {
		const [key, value = ""] = line.split(/:(.*)/s);
		if (key === "SF") files.push(value);
		else if (key in sums) sums[key] += Number(value) || 0;
	}
	const lines = { total: sums.LF, covered: sums.LH };
	return { total: { lines, statements: lines, branches: { total: sums.BRF, covered: sums.BRH }, functions: { total: sums.FNF, covered: sums.FNH } }, files };
}

/** Code outside the workspaces; config files and the smoke test aren't code to cover. */
const ROOT_SOURCES = "!(opx|configs|node_modules)/**/*.js";

/**
 * The `.` row: lcov totals for the tests outside the workspaces, plus files no
 * test loaded, which Node's coverage can't see at all.
 * @param {string} root - The repository root.
 * @returns {Row | undefined} Nothing when those tests weren't run with coverage.
 */
export function readRoot(root) {
	const lcov = join(root, "coverage.lcov");
	if (!existsSync(lcov)) return undefined;
	const { total, files } = parseLcov(readFileSync(lcov, "utf8"));
	const covered = new Set(files.map((file) => relative(root, file).replaceAll("\\", "/")));
	const untested = globSync(ROOT_SOURCES, { cwd: root })
		.map((file) => file.replaceAll("\\", "/"))
		.filter((file) => !file.endsWith(".test.js") && !file.endsWith("/smoke.js") && !covered.has(file))
		.sort();
	return { name: ".", total, untested };
}

/**
 * Add the packages' counts together, so the combined row weighs each line once.
 * @param {Row[]} rows
 * @returns {Totals}
 */
export function combine(rows) {
	return Object.fromEntries(
		METRICS.map((metric) => [
			metric,
			rows.reduce((sum, row) => ({ total: sum.total + row.total[metric].total, covered: sum.covered + row.total[metric].covered }), { total: 0, covered: 0 }),
		]),
	);
}

/**
 * A metric's percentage. Nothing to cover counts as fully covered.
 * @param {Metric} metric
 */
export function percent(metric) {
	return metric.total === 0 ? 100 : (metric.covered / metric.total) * 100;
}

/**
 * One decimal place, rounded down, so 93.96% never shows as a passing 94%.
 * @param {number} value
 */
export function formatPercent(value) {
	const floored = Math.floor(value * 10) / 10;
	return `${Number.isInteger(floored) ? floored : floored.toFixed(1)}%`;
}

/**
 * The report as Markdown.
 * @param {Row[]} rows
 * @param {Record<string, number>} thresholds - Minimum percentages by metric, as in Jest's `coverageThreshold.global`.
 * @returns {string}
 */
export function renderReport(rows, thresholds) {
	if (rows.length === 0) return "## Coverage\n\nNo coverage reports found.\n";
	const below = (metric, total) => percent(total[metric]) < (thresholds[metric] ?? 0);
	const untested = rows.flatMap((row) => (row.untested ?? []).map((file) => `\`${file}\``));
	const cells = (total, check) =>
		METRICS.map((metric) => {
			const text = formatPercent(percent(total[metric]));
			return check && below(metric, total) ? `**${text}** ⚠️` : text;
		});
	const lines = [
		"## Coverage",
		"",
		"| Package | Lines | Branches | Functions | Statements | Status |",
		"| --- | ---: | ---: | ---: | ---: | :---: |",
		...rows.map((row) => `| \`${row.name}\` | ${cells(row.total, true).join(" | ")} | ${passes(row, thresholds) ? "✅" : "❌"} |`),
		`| **All** | ${cells(combine(rows), false).join(" | ")} | |`,
		"",
		...(untested.length > 0 ? [`⚠️ No tests: ${untested.join(", ")}.`, ""] : []),
		`Each row must reach ${describeThresholds(thresholds)}, and every file outside the workspaces needs tests. \`yarn coverage\` enforces it.`,
		"",
	];
	return lines.join("\n");
}

/**
 * Whether a row meets every minimum and has no untested files.
 * @param {Row} row
 * @param {Record<string, number>} thresholds
 */
export function passes(row, thresholds) {
	return (row.untested ?? []).length === 0 && METRICS.every((metric) => percent(row.total[metric]) >= (thresholds[metric] ?? 0));
}

/**
 * "98% of lines and statements and 94% of branches and functions".
 * @param {Record<string, number>} thresholds
 */
export function describeThresholds(thresholds) {
	const byValue = new Map();
	for (const metric of METRICS) {
		if (thresholds[metric] === undefined) continue;
		byValue.set(thresholds[metric], [...(byValue.get(thresholds[metric]) ?? []), metric]);
	}
	return [...byValue].map(([value, metrics]) => `${value}% of ${metrics.join(" and ")}`).join(" and ");
}

/* node:coverage ignore next 8 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const root = resolve(import.meta.dirname, "..");
	const { default: config } = await import(pathToFileURL(join(root, "configs", "jest.config.js")).href);
	const thresholds = config.coverageThreshold?.global ?? {};
	const rows = [...readSummaries(join(root, "opx")), readRoot(root)].filter((row) => row !== undefined);
	process.stdout.write(renderReport(rows, thresholds));
	if (process.argv.includes("--check") && !rows.every((row) => passes(row, thresholds))) process.exitCode = 1;
}
