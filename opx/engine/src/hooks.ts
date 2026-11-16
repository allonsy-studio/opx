import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What opx runs for a hook: the local binary directly, since `npx` adds about a second. */
const runner = (args: string): string => `if [ -f .pnp.cjs ]; then yarn opx ${args}; else PATH="node_modules/.bin:$PATH" opx ${args}; fi`;

/**
 * The line that runs `opx` with `args` from a git hook.
 *
 * Yarn Plug'n'Play has no `node_modules/.bin`, so there it runs through `yarn`.
 * A background line discards its output and never fails the git operation. A
 * blocking line runs in the foreground, forwards git's arguments, and exits with
 * `opx`'s code, so a failure stops the commit or push.
 *
 * @param args - The `opx` arguments, such as `["hook", "commit-msg"]`.
 * @param blocking - Whether a failure should stop the git operation.
 */
export function hookLine(args: string[], blocking = false): string {
	const command = args.join(" ");
	return blocking ? `${runner(`${command} "$@"`)} || exit $?` : `( ${runner(command)} >/dev/null 2>&1 & ) || true`;
}

/** The post-commit nudge's line. */
export const POST_COMMIT_LINE = hookLine(["hook", "post-commit"]);

/** The lines earlier versions wrote for `post-commit`, newest first, upgraded in place. */
const LEGACY_POST_COMMIT_LINES = [
	'( PATH="node_modules/.bin:$PATH" opx hook post-commit >/dev/null 2>&1 & ) || true',
	"( npx --no-install opx hook post-commit >/dev/null 2>&1 & ) || true",
];

/** A top-level `exit`, which stops any line after it from running. */
const TOP_LEVEL_EXIT = /^exit(\s|$)/;

/** The `opx` command a line runs, such as `opx hook commit-msg`, which names the hook it belongs to. */
const COMMAND = /\bopx [^\s;"&|)>]+(?: [^\s;"&|)>]+)*/;

/** A line in the form opx writes, so opx may replace or remove it and leaves hand-written lines alone. */
const OPX_LINE = /^\(? ?if \[ -f \.pnp\.cjs \]; then yarn opx /;

/** The `opx` command in a line, or undefined. */
const commandOf = (line: string): string | undefined => COMMAND.exec(line)?.[0];

/** Whether `line` is one opx wrote for the same command as `line`. */
const isOurs = (line: string, target: string): boolean => OPX_LINE.test(line.trim()) && commandOf(line) === commandOf(target);

/** The hook file a name maps to. */
const hookPath = (cwd: string, name: string): string => join(cwd, ".husky", name);

/**
 * Swap a line an earlier version wrote for `line`, moving it above a top-level
 * `exit` that the first versions appended it after.
 *
 * @returns the upgraded hook, or undefined when it has no earlier line.
 */
function upgradeLegacyLine(existing: string, line: string): string | undefined {
	const lines = existing.split("\n");
	const at = lines.findIndex((l) => LEGACY_POST_COMMIT_LINES.includes(l.trim()));
	if (at === -1) return undefined;
	const exitAt = lines.slice(0, at).findIndex((l) => TOP_LEVEL_EXIT.test(l));
	if (exitAt === -1) {
		lines[at] = line;
	} else {
		lines.splice(at, 1);
		lines.splice(exitAt, 0, line);
	}
	return lines.join("\n");
}

/** The outcome of {@link installHook}. */
export type HookInstallResult = {
	/** Whether a new hook file was written, rather than found or extended. */
	created: boolean;
	/** Whether the hook file changed: created, extended, or upgraded. */
	changed: boolean;
	/** The hook file's path. */
	path: string;
};

/**
 * Install a line into a husky hook, creating the hook when it is missing.
 *
 * Appends to an existing hook, above a trailing top-level `exit`. Leaves the
 * hook alone when it already runs the same `opx` command, and upgrades or
 * replaces a line opx wrote earlier, such as an older `post-commit` line or the
 * same hook with a different `blocking` setting.
 *
 * @param cwd - The repository root.
 * @param name - The git hook, such as `commit-msg`.
 * @param line - The line to run, from {@link hookLine}.
 */
export function installHook(cwd: string, name: string, line: string): HookInstallResult {
	mkdirSync(join(cwd, ".husky"), { recursive: true });
	const path = hookPath(cwd, name);

	if (!existsSync(path)) {
		writeFileSync(path, `#!/usr/bin/env sh\n${line}\nexit 0\n`, "utf8");
		chmodSync(path, 0o755);
		return { created: true, changed: true, path };
	}

	const existing = readFileSync(path, "utf8");
	const lines = existing.split("\n");
	if (lines.some((l) => l.trim() === line)) return { created: false, changed: false, path };

	const stale = lines.findIndex((l) => isOurs(l, line));
	if (stale !== -1) {
		lines[stale] = line;
		writeFileSync(path, lines.join("\n"), "utf8");
		return { created: false, changed: true, path };
	}
	const upgraded = name === "post-commit" ? upgradeLegacyLine(existing, line) : undefined;
	if (upgraded !== undefined) {
		writeFileSync(path, upgraded, "utf8");
		return { created: false, changed: true, path };
	}
	const command = commandOf(line);
	if (command && existing.includes(command)) return { created: false, changed: false, path };

	// Insert above a trailing top-level exit, which would otherwise stop our line from running.
	const trimmed = existing.trimEnd().split("\n");
	const at = TOP_LEVEL_EXIT.test(trimmed.at(-1) ?? "") ? trimmed.length - 1 : trimmed.length;
	trimmed.splice(at, 0, line);
	writeFileSync(path, `${trimmed.join("\n")}\n`, "utf8");
	chmodSync(path, 0o755);
	return { created: false, changed: true, path };
}

/** The outcome of {@link removeHook}. */
export type HookRemoveResult = {
	/** Whether opx's line was found and removed. */
	removed: boolean;
	/** Whether the hook file was deleted because nothing but opx's boilerplate was left. */
	deleted: boolean;
	/** The hook file's path. */
	path: string;
};

/**
 * Remove the line opx wrote for a hook, leaving every other line alone.
 *
 * Deletes the file only when what remains is the shebang, blank lines, and a
 * trailing `exit 0`, the file opx creates.
 *
 * @param cwd - The repository root.
 * @param name - The git hook, such as `commit-msg`.
 * @param line - A line from {@link hookLine} for the hook; either `blocking` form matches.
 */
export function removeHook(cwd: string, name: string, line: string): HookRemoveResult {
	const path = hookPath(cwd, name);
	if (!existsSync(path)) return { removed: false, deleted: false, path };

	const lines = readFileSync(path, "utf8").split("\n");
	const kept = lines.filter((l) => !isOurs(l, line));
	if (kept.length === lines.length) return { removed: false, deleted: false, path };

	const rest = kept.filter((l) => l.trim() !== "" && !l.startsWith("#!") && l.trim() !== "exit 0");
	if (rest.length === 0) {
		rmSync(path);
		return { removed: true, deleted: true, path };
	}
	writeFileSync(path, kept.join("\n"), "utf8");
	return { removed: true, deleted: false, path };
}

/**
 * Add an entry to `.gitignore` unless it is already listed.
 *
 * @param cwd - The repository root.
 * @param entry - The pattern to ignore.
 * @returns true if `.gitignore` was changed.
 */
export function ensureGitignored(cwd: string, entry: string): boolean {
	const path = join(cwd, ".gitignore");
	const current = existsSync(path) ? readFileSync(path, "utf8") : "";
	const lines = current.split("\n");
	if (lines.includes(entry) || lines.includes(`${entry}/`)) return false;
	const next = `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${entry}\n`;
	writeFileSync(path, next, "utf8");
	return true;
}

/** `.gitignore` lines that hide the whole `.opx` folder, config included. */
const HIDES_OPX = new Set([".opx", ".opx/", ".opx/**"]);

/** Normalize a `.gitignore` line for comparison: trim it and drop a leading `/`. */
function pattern(line: string): string {
	return line.trim().replace(/^\/(?!\/)/, "");
}

/**
 * Ignore opx's local files while keeping `.opx/config.json` committable.
 *
 * Leaves `.gitignore` alone when `!.opx/config.json` follows the last `.opx/*`
 * and nothing hides the whole folder. Otherwise drops the opx lines and
 * appends `.opx/*` then `!.opx/config.json`.
 *
 * @returns true if `.gitignore` was changed.
 */
export function ensureOpxIgnored(cwd: string): boolean {
	const path = join(cwd, ".gitignore");
	const current = existsSync(path) ? readFileSync(path, "utf8") : "";
	const eol = current.includes("\r\n") ? "\r\n" : "\n";
	const lines = current.split(/\r?\n/);
	const patterns = lines.map(pattern);

	const ignoreAt = patterns.lastIndexOf(".opx/*");
	const keepAt = patterns.lastIndexOf("!.opx/config.json");
	if (ignoreAt !== -1 && keepAt > ignoreAt && !patterns.some((p) => HIDES_OPX.has(p))) return false;

	const kept = lines.filter((line) => {
		const p = pattern(line);
		return !HIDES_OPX.has(p) && p !== ".opx/*" && p !== "!.opx/config.json";
	});
	const base = kept.join(eol).replace(/(\r?\n)*$/, "");
	writeFileSync(path, [...(base ? [base] : []), ".opx/*", "!.opx/config.json", ""].join(eol), "utf8");
	return true;
}
