import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { resolveTool } from "@allons-y/opx";

import { METRICS, type Metric } from "./settings.js";

/** Covered percentages by metric, from c8's `json-summary` report. */
export type CoverageTotals = Record<Metric, number>;

/**
 * Find c8's executable: the host project's copy first, then the one this plugin bundles.
 *
 * @param cwd - The repository root.
 * @returns The absolute path of c8's script.
 */
export function resolveC8(cwd: string): string {
	const { packagePath } = resolveTool("c8", cwd, createRequire(import.meta.url));
	const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as { bin?: string | Record<string, string> };
	const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.c8;
	if (!bin) throw new Error(`${packagePath} has no c8 executable`);
	return resolve(dirname(packagePath), bin);
}

/**
 * Read the overall percentages from c8's `json-summary` report.
 *
 * @param file - Path of `coverage-summary.json`.
 * @returns The totals, or `undefined` when the report is missing or unreadable.
 */
export function readTotals(file: string): CoverageTotals | undefined {
	try {
		const { total } = JSON.parse(readFileSync(file, "utf8")) as { total?: Record<string, { pct?: unknown }> };
		const totals: Partial<CoverageTotals> = {};
		for (const metric of METRICS) {
			const pct = total?.[metric]?.pct;
			// c8 reports "Unknown" for a metric with nothing to measure.
			totals[metric] = typeof pct === "number" ? pct : 100;
		}
		return totals as CoverageTotals;
	} catch {
		return undefined;
	}
}

/**
 * Run a program, streaming its output as it arrives.
 *
 * @param command - The program.
 * @param args - Its arguments.
 * @param cwd - The working directory.
 * @param onOutput - Called with each chunk of stdout and stderr.
 * @returns The exit code, `1` when the program was killed by a signal.
 */
export function exec(command: string, args: string[], cwd: string, onOutput: (chunk: string) => void): Promise<number> {
	return new Promise((done, fail) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		child.stdout.setEncoding("utf8").on("data", onOutput);
		child.stderr.setEncoding("utf8").on("data", onOutput);
		child.on("error", fail);
		child.on("close", (code) => done(code ?? 1));
	});
}
