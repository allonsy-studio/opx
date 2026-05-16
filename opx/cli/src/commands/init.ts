import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";
import type { Command } from "commander";

import {
	configPath,
	defaultConfig,
	defaultState,
	ensureGitignored,
	installCommand,
	installPostCommitHook,
	readConfig,
	readState,
	writeConfig,
	writeState,
} from "@allons-y/opx";

import { buildContext, readHostPackage } from "../context.js";
import { BUILTIN_LINT_PACKAGE_HINTS, virtualBuiltinDetectors } from "../built-in.js";
import { defaultSkipUntilDate } from "@allons-y/opx";
import { detectMode } from "../tty.js";

type InitOptions = {
	auto: boolean;
	quiet: boolean;
};

export function registerInit(program: Command): void {
	program
		.command("init")
		.description("Scan the repo and interactively wire up opx tooling")
		.option("--auto", "auto-mode (used by postinstall); only proceeds in TTY", false)
		.option("--quiet", "suppress informational output when --auto exits early", false)
		.action(async (opts: InitOptions) => {
			const cwd = process.cwd();
			const mode = detectMode(false);

			if (opts.auto && mode !== "interactive") {
				if (!opts.quiet) {
					console.log("opx: run `opx init` in an interactive shell to wire up tooling.");
				}
				return;
			}

			if (mode === "interactive") {
				await runInteractive(cwd);
			} else {
				runReport(cwd);
			}
		});
}

async function runInteractive(cwd: string): Promise<void> {
	p.intro("opx — front-end dev ops setup");

	if (!existsSync(configPath(cwd))) {
		writeConfig(cwd, defaultConfig());
		p.log.info("Wrote starter opx.config.json.");
	}

	const config = readConfig(cwd);
	const state = readState(cwd);
	const ctx = buildContext({ cwd });

	const suggestions = virtualBuiltinDetectors(ctx.fileTypes, ctx.hostPkg);
	const enabled = new Set(config.lint);
	const remaining = suggestions.filter((s) => !enabled.has(s.shortName));

	if (remaining.length === 0) {
		p.log.success("No new tooling to suggest — your committed tree is fully covered.");
	}

	const accepted: string[] = [];
	const deferred: string[] = [];
	const installCandidates: string[] = [];

	for (const suggestion of remaining) {
		const choice = await p.select({
			message: `Enable ${suggestion.shortName} linting? (${suggestion.pkg}) — ${suggestion.reason}`,
			options: [
				{ value: "yes", label: "Yes — enable now" },
				{ value: "no", label: "No — never (decline)" },
				{ value: "later", label: "Later — ask again on a different branch or day" },
			],
		});
		if (p.isCancel(choice)) {
			p.cancel("Setup cancelled.");
			return;
		}
		if (choice === "yes") {
			accepted.push(suggestion.shortName);
			if (!suggestion.installed) installCandidates.push(suggestion.pkg);
		} else if (choice === "later") {
			deferred.push(suggestion.shortName);
		}
	}

	const nextConfig = {
		...config,
		lint: [...new Set([...config.lint, ...accepted])],
	};
	writeConfig(cwd, nextConfig);

	let nextState = state;
	for (const shortName of deferred) {
		nextState = {
			...nextState,
			deferrals: {
				...nextState.deferrals,
				[shortName]: { branch: ctx.branch, skipUntilDate: defaultSkipUntilDate(), reason: "later" },
			},
		};
	}
	if (Object.keys(nextState.deferrals).length > 0 || nextState.lastScanCommit) {
		writeState(cwd, nextState);
	} else {
		// Ensure the .opx directory exists so the cache subtree has a home.
		writeState(cwd, defaultState());
	}

	if (installCandidates.length > 0) {
		const cmd = installCommand(ctx.pkgManager, installCandidates);
		const confirmed = await p.confirm({
			message: `Install required packages now?\n  ${cmd}`,
			initialValue: true,
		});
		if (!p.isCancel(confirmed) && confirmed) {
			const { execFileSync } = await import("node:child_process");
			const [bin, ...args] = cmd.split(" ");
			if (bin) {
				execFileSync(bin, args, { cwd, stdio: "inherit" });
			}
		} else {
			p.log.info(`Run when ready: ${cmd}`);
		}
	}

	// Patch host package.json scripts opportunistically.
	if (accepted.length > 0) {
		const hostPath = join(cwd, "package.json");
		if (existsSync(hostPath)) {
			const raw = readFileSync(hostPath, "utf8");
			const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
			pkg.scripts ??= {};
			if (!pkg.scripts.lint) {
				const addLint = await p.confirm({
					message: 'Add `"lint": "opx lint"` to package.json scripts?',
					initialValue: true,
				});
				if (!p.isCancel(addLint) && addLint) {
					pkg.scripts.lint = "opx lint";
					writeFileSync(hostPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
				}
			}
		}
	}

	// Install husky post-commit hook + gitignore .opx/
	const hookResult = installPostCommitHook(cwd);
	if (hookResult.created) {
		p.log.success(`Installed git hook at ${hookResult.path}`);
	}
	if (ensureGitignored(cwd, ".opx")) {
		p.log.success("Added .opx/ to .gitignore");
	}

	p.outro("Setup complete.");
}

function runReport(cwd: string): void {
	if (!existsSync(configPath(cwd))) {
		writeConfig(cwd, defaultConfig());
		console.log("opx: wrote starter opx.config.json.");
	}
	const hostPkg = readHostPackage(cwd);
	const ctx = buildContext({ cwd });
	const suggestions = virtualBuiltinDetectors(ctx.fileTypes, hostPkg);
	const enabled = new Set(ctx.config.lint);
	const remaining = suggestions.filter((s) => !enabled.has(s.shortName));
	if (remaining.length === 0) {
		console.log("opx: nothing new to suggest.");
		return;
	}
	console.log("opx: detected file types that match these built-in detectors:");
	for (const s of remaining) {
		console.log(`  - ${s.shortName}: install ${s.pkg}, then run \`opx enable ${s.shortName}\``);
	}
}
