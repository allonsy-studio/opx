import type { Command } from "commander";

import { buildContext } from "../context.js";
import { UNDETECTABLE_PLUGINS, enabledNames, virtualDetectors } from "../built-in.js";
import { detectMode } from "../tty.js";
import { CLI_NAME } from "../plugin-kit.js";

type ScanOptions = {
	report: boolean;
	json: boolean;
	strict: boolean;
};

export default function register(program: Command): void {
	program
		.command("scan")
		.description("Scan the committed tree and report which detectors would activate")
		.option("--report", "non-interactive table output", false)
		.option("--json", "machine-readable JSON output", false)
		.option("--strict", "exit non-zero if any detector needs prompting", false)
		.action(async (opts: ScanOptions) => {
			const cwd = process.cwd();
			const ctx = buildContext({ cwd });
			const suggestions = virtualDetectors(ctx.fileTypes, ctx.hostPkg);

			const enabledLinters = new Set([...enabledNames(ctx.config.lint), ...(ctx.config.release === true ? ["release"] : [])]);
			// Plugins like release can't be inferred from files, so they never count as missing.
			const needsPrompt = suggestions.filter((s) => !enabledLinters.has(s.shortName) && !(UNDETECTABLE_PLUGINS as string[]).includes(s.shortName));

			const mode = detectMode(opts.report || opts.json);

			if (opts.json) {
				const payload = {
					branch: ctx.branch,
					fileTypes: [...ctx.fileTypes].sort(),
					enabled: [...enabledLinters],
					suggestions,
					needsPrompt: needsPrompt.map((s) => s.shortName),
				};
				process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
			} else if (mode === "report") {
				renderReport(ctx.fileTypes, [...enabledLinters], suggestions);
			} else {
				renderInteractive(ctx.fileTypes, [...enabledLinters], suggestions);
			}

			if (opts.strict && needsPrompt.length > 0) {
				process.exit(1);
			}
		});
}

function renderReport(
	fileTypes: Set<string>,
	enabled: string[],
	suggestions: ReturnType<typeof virtualDetectors>,
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
	suggestions: ReturnType<typeof virtualDetectors>,
): void {
	renderReport(fileTypes, enabled, suggestions);
	console.log(`\nRun \`${CLI_NAME} init\` to enable suggestions interactively.`);
}
