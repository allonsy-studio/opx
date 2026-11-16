import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DetectorContext } from "@allons-y/opx";
import { enabledNames, filterPathsByExtension } from "@allons-y/opx";

import { EXTENSIONS_BY_PLUGIN, FORMAT_EXTENSIONS } from "./extensions.js";

/** The package root, where the bundled `prettier.config.js` lives. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Patterns excluded from every run, matching what the ESLint plugins ignore. */
const BUILT_IN_IGNORES = [
	"!**/node_modules/**",
	"!**/.yarn/**",
	"!**/.pnp.*",
	"!**/.opx/**",
	"!**/bin/**",
	"!**/dist/**",
];

/** What a Prettier process returned. */
export type PrettierResult = {
	/** The exit code. */
	code: number;
	/** Standard output. */
	stdout: string;
	/** Standard error. */
	stderr: string;
};

/** The outside world {@link runFormat} touches, injectable so tests don't spawn Prettier. */
export type FormatDeps = {
	/**
	 * Run Prettier from the plugin's own dependencies.
	 *
	 * @param args - The Prettier command-line arguments.
	 * @param cwd - The directory to run in.
	 * @returns The exit code and output.
	 */
	prettier(args: string[], cwd: string): Promise<PrettierResult>;
};

/** Run the Prettier that ships with this package, so it resolves in every package-manager layout. */
const defaultDeps: FormatDeps = {
	prettier(args, cwd) {
		const bin = createRequire(import.meta.url).resolve("prettier/bin/prettier.cjs");
		return new Promise((done) => {
			execFile(
				process.execPath,
				[bin, ...args],
				{ cwd, maxBuffer: 64 * 1024 * 1024 },
				(error, stdout, stderr) => {
					const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
					done({
						code,
						stdout,
						stderr: error && typeof error.code !== "number" ? `${stderr}${error.message}` : stderr,
					});
				},
			);
		});
	},
};

/**
 * Get the extensions to format: those of the enabled lint plugins that opx knows,
 * or every one of them when none narrows it.
 *
 * @param ctx - The detector context.
 * @returns The extensions, with the leading dot.
 */
export function formatExtensions(ctx: DetectorContext): ReadonlySet<string> {
	const owned = enabledNames(ctx.config.lint).flatMap((name) => EXTENSIONS_BY_PLUGIN[name] ?? []);
	return owned.length > 0 ? new Set(owned) : FORMAT_EXTENSIONS;
}

/**
 * Get the Prettier config file: the user's, when `format` is a path, otherwise the bundled default.
 *
 * @param ctx - The detector context.
 * @returns An absolute path.
 */
export function configFile(ctx: DetectorContext): string {
	const setting = ctx.config.lint?.format;
	if (typeof setting !== "string") return join(PACKAGE_ROOT, "prettier.config.js");
	return isAbsolute(setting) ? setting : resolve(ctx.cwd, setting);
}

/** Pick the lines of Prettier's output that start with `prefix`, without it. */
function linesWith(text: string, prefix: string): string[] {
	return text
		.split("\n")
		.filter((line) => line.startsWith(prefix))
		.map((line) => line.slice(prefix.length));
}

/** Join a heading and an indented list of files. */
function listFiles(heading: string, files: string[]): string {
	return [heading, ...files.map((file) => `  ${file}`)].join("\n");
}

/** Pluralize `file`. */
function files(count: number): string {
	return `${count} file${count === 1 ? "" : "s"}`;
}

/**
 * Format with Prettier.
 *
 * Checks by default, and writes when `ctx.fix` is set (unless `ctx.dryRun`).
 * Prettier reads `.gitignore` and `.prettierignore`.
 *
 * @param ctx - The detector context.
 * @param args - Paths forwarded from the command line; any whose extension opx doesn't format are dropped.
 * @param deps - Runs Prettier; defaults to the bundled one.
 * @returns `1` when a file needs formatting (check) or can't be parsed, otherwise `0`.
 */
export async function runFormat(ctx: DetectorContext, args: string[], deps: FormatDeps = defaultDeps): Promise<number> {
	const extensions = formatExtensions(ctx);
	const requested = args.length > 0 ? filterPathsByExtension(args, extensions) : null;
	if (requested && requested.length === 0) return 0;

	const write = ctx.fix && !ctx.dryRun;
	const defaults = [`**/*.{${[...extensions].map((ext) => ext.slice(1)).join(",")}}`];
	const prettierArgs = [
		// Writing lists the files it changed; checking stays quiet except for the ones that differ.
		...(write ? ["--write", "--list-different"] : ["--check", "--log-level", "warn"]),
		"--config",
		configFile(ctx),
		"--ignore-path",
		join(ctx.cwd, ".gitignore"),
		"--ignore-path",
		join(ctx.cwd, ".prettierignore"),
		// Plain text, so the lines below parse the same with or without a terminal.
		"--no-color",
		"--ignore-unknown",
		"--no-error-on-unmatched-pattern",
		...(requested ?? defaults),
		...BUILT_IN_IGNORES,
	];

	const { code, stdout, stderr } = await deps.prettier(prettierArgs, ctx.cwd);
	const problems = linesWith(stderr, "[error] ");
	const out: string[] = [];

	if (write) {
		const changed = stdout.split("\n").filter(Boolean);
		if (changed.length > 0) out.push(listFiles(`Formatted ${files(changed.length)}:`, changed));
	} else {
		const unformatted = linesWith(stderr, "[warn] ").filter((line) => !line.startsWith("Code style issues"));
		if (unformatted.length > 0) {
			out.push(
				listFiles(
					`${files(unformatted.length)} need${unformatted.length === 1 ? "s" : ""} formatting:`,
					unformatted,
				),
			);
			out.push("Run `opx lint --fix` to write the changes.");
		}
	}

	if (problems.length > 0) out.push(problems.join("\n"));
	else if (code !== 0 && out.length === 0) out.push(`prettier exited with code ${code}.\n${stderr}${stdout}`.trim());

	if (out.length > 0) ctx.write(`${out.join("\n")}\n`);
	return code === 0 && problems.length === 0 ? 0 : 1;
}
