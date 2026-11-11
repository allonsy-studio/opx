import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";
import type { Command } from "commander";
import type { Detector, DetectorContext, Logger, PackageJson } from "@allons-y/opx";
import { CLI_NAME, prereleaseTag, withTag } from "../plugin-kit.js";

import {
	configPath,
	defaultConfig,
	defaultState,
	enabledNames,
	ensureOpxIgnored,
	inspectPackageManager,
	installCommand,
	installPostCommitHook,
	readConfig,
	readState,
	writeConfig,
	writeState,
	type OpxConfig,
} from "@allons-y/opx";

import { applyCleanup, describePlan, planCleanup } from "../cleanup.js";
import { buildContext, readHostPackage } from "../context.js";
import { load as loadDetectors, virtualDetectors, type Suggestion } from "../built-in.js";
import { colors } from "../colors.js";
import { PLUGIN_CATALOG } from "../plugin-catalog.js";
import { scaffoldEslintConfig } from "../eslint-scaffold.js";
import { saveConfig } from "../save-config.js";
import { defaultSkipUntilDate, isTaskEnabled } from "@allons-y/opx";
import { detectMode } from "../tty.js";

export type InitOptions = {
	auto: boolean;
	quiet: boolean;
	/** Opt in to the plugins' cleanup suggestions and the offer to delete empty files. */
	cleanup?: boolean;
	/** Accept suggestions without prompting: every file-based one, or a comma-separated list of short names. */
	yes?: boolean;
	accept?: string;
};

/** Loads the detectors of the enabled plugins; injectable so tests don't import real plugins. */
export type DetectorLoader = (ctx: DetectorContext) => Promise<Detector[]>;

/** Options shared by the interactive and report flows. */
export type CleanupOptions = {
	/** Set to `true` to show the plugins' cleanup suggestions and offer to delete empty files. */
	cleanup?: boolean;
	/** Loads the enabled plugins' detectors; defaults to the built-in loader. */
	detectors?: DetectorLoader;
	/** npm dist-tag to install plugins from, set when this CLI is a prerelease. */
	tag?: string;
};

export default function register(program: Command): void {
	program
		.command("init")
		.description(`Scan the repo and interactively wire up ${CLI_NAME} tooling`)
		.option("--auto", "auto-mode (used by postinstall); only proceeds in TTY", false)
		.option("--quiet", "suppress informational output when --auto exits early", false)
		.option("--cleanup", "show what your plugins make unnecessary, and offer to delete empty files git can restore")
		.option("--yes", "accept every suggestion that matches your files, without prompting")
		.option("--accept <names>", "accept these plugins without prompting (comma-separated short names, such as js,md,release)")
		.action(async (opts: InitOptions) => {
			const cwd = process.cwd();
			const mode = detectMode(false);

			const tag = prereleaseTag(program.version());
			if (!opts.auto && (opts.yes || opts.accept)) {
				process.exitCode = await runAccept(cwd, runInstall, {
					tag,
					accept: opts.accept ? opts.accept.split(",").map((n) => n.trim()).filter(Boolean) : "files",
					cleanup: opts.cleanup,
				});
				return;
			}

			if (opts.auto && mode !== "interactive") {
				if (!opts.quiet) {
					console.log(`${CLI_NAME}: run \`${CLI_NAME} init\` in an interactive shell to wire up tooling.`);
				}
				return;
			}

			if (mode === "interactive") {
				await runInteractive(cwd, runInstall, { cleanup: opts.cleanup && !opts.auto, tag });
			} else {
				await runReport(cwd, { cleanup: opts.cleanup });
			}
		});
}

/** Runs an install command in the project; injectable so tests don't spawn a package manager. */
export type InstallRunner = (cmd: string, cwd: string) => Promise<void> | void;

export const runInstall: InstallRunner = async (cmd, cwd) => {
	const { execFileSync } = await import("node:child_process");
	const [bin, ...args] = cmd.split(" ");
	if (bin) execFileSync(bin, args, { cwd, stdio: "inherit" });
};

/** Whether a suggestion is already covered by the config. */
function isPending(s: Suggestion, config: OpxConfig): boolean {
	if (s.shortName === "release") return !isTaskEnabled(config.release);
	if (s.pkg.includes("opx-build-")) return !enabledNames(config.build).includes(s.shortName);
	return !enabledNames(config.lint).includes(s.shortName);
}

/** The config with the accepted suggestions switched on; everything else is kept. */
function applyAccepted(config: OpxConfig, accepted: Suggestion[]): OpxConfig {
	const names = (marker: string): string[] => accepted.filter((s) => s.pkg.includes(marker)).map((s) => s.shortName);
	return {
		...config,
		lint: {
			...(config.lint ?? {}),
			...Object.fromEntries(names("opx-lint-").map((shortName) => [shortName, true])),
		},
		build: {
			...(config.build ?? {}),
			...Object.fromEntries(names("opx-build-").map((shortName) => [shortName, true])),
		},
		// Keep release settings; `true` only turns it on.
		release: isTaskEnabled(config.release) ? config.release : accepted.some((s) => s.shortName === "release"),
		test: config.test === true,
	} as OpxConfig;
}

/**
 * Interactively choose and wire up tooling for the repository.
 *
 * Asks about each plugin the committed tree suggests (yes, no, or later),
 * saves the choices, offers to install missing packages and add a `lint`
 * script, scaffolds `eslint.config.js`, and installs the post-commit hook.
 *
 * @param cwd - The repository root.
 * @param install - Runs the package manager; defaults to spawning it.
 * @param options - Cleanup settings; see {@link CleanupOptions}.
 */
export async function runInteractive(cwd: string, install: InstallRunner = runInstall, options: CleanupOptions = {}): Promise<void> {
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

	const remaining = suggestions.filter((s) => isPending(s, config));

	if (remaining.length === 0) {
		p.log.success("No new tooling to suggest — your committed tree is fully covered.");
	}

	const accepted: typeof suggestions = [];
	const deferred: string[] = [];
	const installCandidates: string[] = [];

	for (const suggestion of remaining) {
		const choice = await p.select({
			message: `Enable ${suggestion.shortName} (${suggestion.pkg})? — ${suggestion.reason}${suggestion.requires.length > 0 ? ` Requires ${suggestion.requires.join(", ")}.` : ""}`,
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
			installCandidates.push(...suggestion.requires.filter((dep) => !hasDependency(ctx.hostPkg, dep) && !installCandidates.includes(dep)));
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

	const nextConfig = applyAccepted(config, accepted);
	saveConfig(cwd, nextConfig, (message) => p.log.warn(message));

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
		const pm = inspectPackageManager(cwd, ctx.hostPkg);
		const cmd = installCommand(pm.name, withTag(installCandidates, options.tag), pm);
		if (!pm.certain) {
			p.log.warn(`Not sure which package manager to use (${pm.reason}). Run the one you use:\n  ${cmd}`);
		} else {
			const confirmed = await p.confirm({
				message: `Install required packages now?\n  ${cmd}`,
				initialValue: true,
			});
			if (!p.isCancel(confirmed) && confirmed) {
				await install(cmd, cwd);
			} else {
				p.log.info(`Run when ready: ${cmd}`);
			}
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

	if (options.cleanup) {
		await offerCleanup(cwd, options.detectors ?? loadDetectors);
	}

	p.outro("Setup complete.");
}

/** Whether the host lists `dep` in its dependencies or devDependencies. */
function hasDependency(pkg: PackageJson, dep: string): boolean {
	return dep in (pkg.dependencies ?? {}) || dep in (pkg.devDependencies ?? {});
}

/** Drops every message, so loading plugins for cleanup never warns about ones that are not installed. */
const SILENT: Logger = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * Show what the enabled plugins suggest dropping, and offer to delete empty files.
 *
 * Only empty files that git can restore are ever deleted. Everything else is
 * printed for the person to do.
 *
 * @param cwd - The repository root.
 * @param load - Loads the enabled plugins' detectors.
 */
async function offerCleanup(cwd: string, load: DetectorLoader): Promise<void> {
	const ctx = buildContext({ cwd, logger: SILENT });
	const plan = planCleanup(ctx, await load(ctx));
	const lines = describePlan(plan);
	if (lines.length > 0) p.log.info(lines.join("\n"));
	if (plan.delete.length === 0) return;

	const confirmed = await p.confirm({ message: `Delete the ${plan.delete.length} empty file(s) listed above? git can restore them.`, initialValue: true });
	if (p.isCancel(confirmed) || !confirmed) {
		p.log.info("Left them in place.");
		return;
	}
	p.log.success(`Deleted ${applyCleanup(cwd, plan.delete).join(", ")}.`);
}

/**
 * Non-interactive `init`: print what would be suggested instead of prompting.
 *
 * @param cwd - The repository root.
 * @param options - Cleanup settings; see {@link CleanupOptions}.
 */
export async function runReport(cwd: string, options: CleanupOptions = {}): Promise<void> {
	if (!existsSync(configPath(cwd))) {
		writeConfig(cwd, defaultConfig());
		console.log(`${CLI_NAME}: wrote starter .${CLI_NAME}/config.json.`);
	}
	const hostPkg = readHostPackage(cwd);
	const ctx = buildContext({ cwd });
	const suggestions = virtualDetectors(ctx.fileTypes, hostPkg);
	const remaining = suggestions.filter((s) => isPending(s, ctx.config));
	if (remaining.length === 0) {
		console.log(`${CLI_NAME}: nothing new to suggest.`);
	} else {
		console.log(`${CLI_NAME}: detected file types that match these built-in detectors (\`${CLI_NAME} init --yes\` sets them all up):`);
		for (const s of remaining) {
			const install = [s.pkg, ...s.requires.filter((dep) => !hasDependency(hostPkg, dep))].join(" ");
			console.log(`  - ${s.shortName}: install ${install}, then run \`${CLI_NAME} enable ${s.shortName}\``);
		}
	}

	if (!options.cleanup) return;
	const quiet = buildContext({ cwd, logger: SILENT });
	const lines = describePlan(planCleanup(quiet, await (options.detectors ?? loadDetectors)(quiet)));
	if (lines.length > 0) {
		console.log(`${CLI_NAME}: cleanup suggestions from your plugins (run \`${CLI_NAME} init --cleanup\` in a terminal to delete empty files):`);
		for (const line of lines) console.log(line);
	}
}

/** What {@link runAccept} should enable. */
export type AcceptOptions = CleanupOptions & {
	/** `"files"` accepts every suggestion that matches the committed files; a list names plugins, including ones files can't imply, like `release`. */
	accept: "files" | string[];
};

/**
 * Non-interactive setup: accepts suggestions without prompting and does everything
 * the interactive flow does. Cleanup suggestions are printed, never applied.
 *
 * @param cwd - The repository root.
 * @param install - Runs the package manager; defaults to spawning it.
 * @param options - What to accept, plus cleanup settings; see {@link AcceptOptions}.
 * @returns `1` if a name is unknown or the install fails, otherwise `0`.
 */
export async function runAccept(cwd: string, install: InstallRunner = runInstall, options: AcceptOptions): Promise<number> {
	const ok = (msg: string, detail = ""): void => console.log(`  ${colors.green("✔")} ${msg}${detail ? ` ${colors.dim(detail)}` : ""}`);
	const skip = (msg: string): void => console.log(`  ${colors.dim(`– ${msg}`)}`);
	const hint = (msg: string): void => console.log(`    ${colors.dim(msg)}`);

	if (!existsSync(configPath(cwd))) writeConfig(cwd, defaultConfig());
	const ctx = buildContext({ cwd });
	const config = readConfig(cwd);

	const everything = virtualDetectors(new Set(PLUGIN_CATALOG.flatMap((e) => e.extensions)), ctx.hostPkg);
	const matched = virtualDetectors(ctx.fileTypes, ctx.hostPkg).filter((s) => s.shortName !== "release");
	let chosen: Suggestion[];
	if (options.accept === "files") {
		chosen = matched;
	} else {
		const unknown = options.accept.filter((n) => !everything.some((s) => s.shortName === n));
		if (unknown.length > 0) {
			console.error(`${colors.red("✖")} Unknown plugin${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
			console.error(`  ${colors.dim(`Use any of: ${[...new Set(everything.map((s) => s.shortName))].join(", ")}`)}`);
			return 1;
		}
		chosen = everything.filter((s) => (options.accept as string[]).includes(s.shortName));
	}

	const accepted = chosen.filter((s) => isPending(s, config));
	for (const s of chosen) if (!accepted.includes(s)) skip(`${s.shortName} already enabled`);
	if (accepted.length === 0 && chosen.length === 0) skip("No plugins match the committed files");

	const nextConfig = applyAccepted(config, accepted);
	writeConfig(cwd, nextConfig);
	writeState(cwd, readState(cwd));
	for (const s of accepted) ok(`Enabled ${s.shortName}`, s.pkg);

	const missing = accepted.filter((s) => !s.installed).map((s) => s.pkg);
	if (missing.length > 0) {
		const pm = inspectPackageManager(cwd, ctx.hostPkg);
		const cmd = installCommand(pm.name, withTag(missing, options.tag), pm);
		if (!pm.certain) {
			console.log(`  ${colors.yellow("▲")} Not sure which package manager to use ${colors.dim(`(${pm.reason})`)}`);
			hint(`Run the one you use: ${cmd}`);
		} else {
			console.log(`  ${colors.cyan("●")} Installing ${missing.join(", ")}`);
			try {
				await install(cmd, cwd);
				ok("Installed packages", cmd);
			} catch {
				console.error(`  ${colors.red("✖")} Install failed`);
				console.error(`    ${colors.dim(`Run it yourself, then \`${CLI_NAME} lint\`: ${cmd}`)}`);
				return 1;
			}
		}
	}

	if (scaffoldEslintConfig(cwd, Object.keys(nextConfig.lint ?? {}))) ok("Wrote eslint.config.js");

	const hostPath = join(cwd, "package.json");
	if (accepted.length > 0 && existsSync(hostPath)) {
		const pkg = JSON.parse(readFileSync(hostPath, "utf8")) as { scripts?: Record<string, string> };
		pkg.scripts ??= {};
		if (!pkg.scripts.lint) {
			pkg.scripts.lint = `${CLI_NAME} lint`;
			writeFileSync(hostPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
			ok("Added a lint script", `"lint": "${CLI_NAME} lint"`);
		}
	}

	const hookResult = installPostCommitHook(cwd);
	if (hookResult.created) ok("Installed git hook", hookResult.path);
	if (ensureOpxIgnored(cwd)) ok("Updated .gitignore", `ignores local .${CLI_NAME}/ files`);

	if (options.cleanup) {
		const quiet = buildContext({ cwd, logger: SILENT });
		const lines = describePlan(planCleanup(quiet, await (options.detectors ?? loadDetectors)(quiet)));
		if (lines.length > 0) {
			console.log(`  ${colors.yellow("▲")} Your plugins suggest cleanup ${colors.dim("(nothing is deleted without a terminal)")}`);
			for (const line of lines) console.log(line);
		}
	}

	console.log(`\n  ${colors.dim(`Next: \`${CLI_NAME} lint\``)}`);
	return 0;
}
