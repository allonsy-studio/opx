import type { Command } from "commander";

import { buildContext } from "../context.js";
import { virtualBuiltinDetectors } from "../built-in.js";
import { detectMode } from "../tty.js";

type ScanOptions = {
	report: boolean;
	json: boolean;
	strict: boolean;
};

export function registerScan(program: Command): void {
	program
		.command("scan")
		.description("Scan the committed tree and report which detectors would activate")
		.option("--report", "non-interactive table output", false)
		.option("--json", "machine-readable JSON output", false)
		.option("--strict", "exit non-zero if any detector needs prompting", false)
		.action(async (opts: ScanOptions) => {
			const cwd = process.cwd();
			const ctx = buildContext({ cwd });
			const suggestions = virtualBuiltinDetectors(ctx.fileTypes, ctx.hostPkg);

			const enabled = new Set(ctx.config.lint);
			const needsPrompt = suggestions.filter((s) => !enabled.has(s.shortName));

			const mode = detectMode(opts.report || opts.json);

			if (opts.json) {
				const payload = {
					branch: ctx.branch,
					fileTypes: [...ctx.fileTypes].sort(),
					enabled: ctx.config.lint,
					suggestions,
					needsPrompt: needsPrompt.map((s) => s.shortName),
				};
				process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
			} else if (mode === "report") {
				renderReport(ctx.fileTypes, ctx.config.lint, suggestions);
			} else {
				renderInteractive(ctx.fileTypes, ctx.config.lint, suggestions);
			}

			if (opts.strict && needsPrompt.length > 0) {
				process.exit(1);
			}
		});
}

function renderReport(
	fileTypes: Set<string>,
	enabled: string[],
	suggestions: ReturnType<typeof virtualBuiltinDetectors>,
): void {
	console.log(`File types in committed tree: ${[...fileTypes].sort().join(", ") || "(none)"}`);
	console.log(`Enabled lint detectors: ${enabled.length > 0 ? enabled.join(", ") : "(none)"}`);
	if (suggestions.length === 0) {
		console.log("No additional lint suggestions for this repo.");
		return;
	}
	console.log("Suggestions:");
	for (const s of suggestions) {
		const status = enabled.includes(s.shortName) ? "enabled" : s.installed ? "installed, not enabled" : "not installed";
		console.log(`  - ${s.shortName} (${s.pkg}) — ${s.reason} [${status}]`);
	}
}

function renderInteractive(
	fileTypes: Set<string>,
	enabled: string[],
	suggestions: ReturnType<typeof virtualBuiltinDetectors>,
): void {
	renderReport(fileTypes, enabled, suggestions);
	console.log("\nRun `opx init` to enable suggestions interactively.");
}
