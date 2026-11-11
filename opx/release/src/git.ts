import { spawnSync } from "node:child_process";

/** What a git command returned. */
export type GitResult = { ok: boolean; stdout: string; stderr: string };

/**
 * Run git in `cwd` and capture its output. Never throws.
 * @param env - Extra environment variables, such as `GIT_INDEX_FILE`.
 */
export function git(cwd: string, args: string[], env: Record<string, string> = {}): GitResult {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
	return { ok: result.status === 0, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() };
}
