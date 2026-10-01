import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";
import type { Command } from "commander";
import { CLI_NAME } from "../plugin-kit.js";

import {
	configPath,
	defaultConfig,
	defaultState,
	ensureOpxIgnored,
	installCommand,
	installPostCommitHook,
	readConfig,
	readState,
	writeConfig,
	writeState,
	type OpxConfig,
} from "@allons-y/opx";

import { buildContext, readHostPackage } from "../context.js";
import { enabledNames, virtualDetectors } from "../built-in.js";
import { scaffoldEslintConfig } from "../eslint-scaffold.js";
import { defaultSkipUntilDate } from "@allons-y/opx";
import { detectMode } from "../tty.js";

export type InitOptions = {
	auto: boolean;
	quiet: boolean;
};

export default function register(program: Command): void {
	program
		.command("init")
		.description(`Scan the repo and interactively wire up ${CLI_NAME} tooling`)
		.option("--auto", "auto-mode (used by postinstall); only proceeds in TTY", false)
		.option("--quiet", "suppress informational output when --auto exits early", false)
		.action(async (opts: InitOptions) => {
			const cwd = process.cwd();
			const mode = detectMode(false);

			if (opts.auto && mode !== "interactive") {
				if (!opts.quiet) {
					console.log(`${CLI_NAME}: run \`${CLI_NAME} init\` in an interactive shell to wire up tooling.`);
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
	p.intro(`${CLI_NAME} toolkit setup`);

	if (!existsSync(configPath(cwd))) {
		writeConfig(cwd, defaultConfig());
		p.log.info(`Wrote starter .${CLI_NAME}/config.json at the detected repo root (${cwd}).`);
	}

	const config = readConfig(cwd);
	const state = readState(cwd);
	const ctx = buildContext({ cwd });

	// Suggested tooling that is indicated by files present in the committed tree.
	const suggestions = virtualDetectors(ctx.fileTypes, ctx.hostPkg);

	const enabledLinters = new Set(enabledNames(config.lint));
	const enabledBuilders = new Set(enabledNames(config.build));

	// A suggestion is already covered if its concern is enabled for that short name.
	const remaining = suggestions.filter((s) => {
		if (s.shortName === "release") return config.release !== true;
		if (s.pkg.includes("opx-build-")) return !enabledBuilders.has(s.shortName);
		return !enabledLinters.has(s.shortName);
	});

	if (remaining.length === 0) {
		p.log.success("No new tooling to suggest — your committed tree is fully covered.");
	}

	const accepted: typeof suggestions = [];
	const deferred: string[] = [];
	const installCandidates: string[] = [];

	for (const suggestion of remaining) {
		const choice = await p.select({
			message: `Enable ${suggestion.shortName} (${suggestion.pkg})? — ${suggestion.reason}`,
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
			accepted.push(suggestion);
			if (!suggestion.installed) installCandidates.push(suggestion.pkg);
			// if (suggestion.shortName === "json") {
			// 	const dialects = await p.multiselect({
			// 		message: "Also lint JSON variants? (.json is always included)",
			// 		options: [
			// 			{ value: "jsonc", label: "JSONC — JSON with comments (e.g. tsconfig.json)" },
			// 			{ value: "json5", label: "JSON5 — relaxed JSON (trailing commas, unquoted keys)" },
			// 		],
			// 		required: false,
			// 	});
			// 	if (p.isCancel(dialects)) {
			// 		p.cancel("Setup cancelled.");
			// 		return;
			// 	}
			// }
		} else if (choice === "later") {
			deferred.push(suggestion.shortName);
		}
	}

	const acceptedLint = accepted.filter((s) => s.pkg.includes("opx-lint-")).map((s) => s.shortName);
	const acceptedBuild = accepted.filter((s) => s.pkg.includes("opx-build-")).map((s) => s.shortName);

	const nextConfig = {
		...config,
		lint: {
			...(config.lint ?? {}),
			...Object.fromEntries(acceptedLint.map((shortName) => [shortName, true])),
		},
		build: {
			...(config.build ?? {}),
			...Object.fromEntries(acceptedBuild.map((shortName) => [shortName, true])),
		},
		release: config.release === true || accepted.some((s) => s.shortName === "release"),
		test: config.test === true,
	} as OpxConfig;
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

	// Scaffold a composable root eslint.config.js so editors and a plain
	// `eslint .` see the same rules as `opx lint`. Never clobbers an existing
	// file, and only includes detectors that are actually installed.
	const scaffolded = scaffoldEslintConfig(cwd, Object.keys(nextConfig.lint ?? {}));
	if (scaffolded) {
		p.log.success("Wrote a composable eslint.config.js — edit it to add your own or third-party rules.");
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
					message: `Add \`"lint": "${CLI_NAME} lint"\` to package.json scripts?`,
					initialValue: true,
				});
				if (!p.isCancel(addLint) && addLint) {
					pkg.scripts.lint = `${CLI_NAME} lint`;
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
	if (ensureOpxIgnored(cwd)) {
		p.log.success(`Updated .gitignore to ignore local .${CLI_NAME}/ files (config.json stays tracked)`);
	}

	p.outro("Setup complete.");
}

function runReport(cwd: string): void {
	if (!existsSync(configPath(cwd))) {
		writeConfig(cwd, defaultConfig());
		console.log(`${CLI_NAME}: wrote starter ${CLI_NAME}.config.json.`);
	}
	const hostPkg = readHostPackage(cwd);
	const ctx = buildContext({ cwd });
	const suggestions = virtualDetectors(ctx.fileTypes, hostPkg);
	const enabledLinters = new Set(enabledNames(ctx.config.lint));
	const enabledBuilders = new Set(enabledNames(ctx.config.build));
	const remaining = suggestions.filter((s) => {
		if (s.shortName === "release") return ctx.config.release !== true;
		if (s.pkg.includes("opx-build-")) return !enabledBuilders.has(s.shortName);
		return !enabledLinters.has(s.shortName);
	});
	if (remaining.length === 0) {
		console.log(`${CLI_NAME}: nothing new to suggest.`);
		return;
	}
	console.log(`${CLI_NAME}: detected file types that match these built-in detectors:`);
	for (const s of remaining) {
		console.log(`  - ${s.shortName}: install ${s.pkg}, then run \`${CLI_NAME} enable ${s.shortName}\``);
	}
}
