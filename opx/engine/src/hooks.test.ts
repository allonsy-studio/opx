import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { useScratch } from "shared/testing.js";

import { POST_COMMIT_LINE, ensureGitignored, ensureOpxIgnored, hookLine, installHook, removeHook } from "./hooks.js";

const installPostCommitHook = (cwd: string) => installHook(cwd, "post-commit", POST_COMMIT_LINE);

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-hooks-"));
}

/** Windows has no executable bit, so mode checks run only on POSIX. */
const itPosix = process.platform === "win32" ? it.skip : it;

const mode = (path: string): number => statSync(path).mode & 0o777;

describe("installHook for post-commit", () => {
	it("creates a new post-commit hook", () => {
		const dir = tmp();
		const result = installPostCommitHook(dir);
		expect(result.created).toBe(true);
		expect(readFileSync(result.path, "utf8")).toContain("opx hook post-commit");
		rmSync(dir, { recursive: true });
	});

	it("runs the local binary without going through npx", () => {
		const dir = tmp();
		const contents = readFileSync(installPostCommitHook(dir).path, "utf8");
		expect(contents).toContain('PATH="node_modules/.bin:$PATH" opx hook post-commit');
		expect(contents).not.toContain("npx");
		rmSync(dir, { recursive: true });
	});

	it("is idempotent when the marker is already present", () => {
		const dir = tmp();
		const first = installPostCommitHook(dir);
		const before = readFileSync(first.path, "utf8");
		const result = installPostCommitHook(dir);
		expect(result.created).toBe(false);
		expect(readFileSync(result.path, "utf8")).toBe(before);
		rmSync(dir, { recursive: true });
	});

	it("does not append the line again to a hook that already has it", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".husky"), { recursive: true });
		writeFileSync(join(dir, ".husky", "post-commit"), "#!/usr/bin/env sh\necho hi\n", "utf8");
		expect(installPostCommitHook(dir).created).toBe(false);
		const once = readFileSync(join(dir, ".husky", "post-commit"), "utf8");
		expect(once).toContain("echo hi");
		installPostCommitHook(dir);
		const twice = readFileSync(join(dir, ".husky", "post-commit"), "utf8");
		expect(twice).toBe(once);
		expect(twice.split("\n").filter((line) => line.includes("opx hook post-commit"))).toHaveLength(1);
		rmSync(dir, { recursive: true });
	});

	it("inserts above a trailing top-level exit so the line still runs", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".husky"), { recursive: true });
		writeFileSync(join(dir, ".husky", "post-commit"), "#!/usr/bin/env sh\necho hi\nexit 0\n", "utf8");
		installPostCommitHook(dir);
		const lines = readFileSync(join(dir, ".husky", "post-commit"), "utf8").trimEnd().split("\n");
		expect(lines.at(-1)).toBe("exit 0");
		expect(lines.findIndex((line) => line.includes("opx hook post-commit"))).toBe(lines.length - 2);
		rmSync(dir, { recursive: true });
	});

	it("leaves an indented exit alone and appends at the end", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".husky"), { recursive: true });
		writeFileSync(join(dir, ".husky", "post-commit"), "#!/usr/bin/env sh\nif false; then\n  exit 1\nfi\n", "utf8");
		installPostCommitHook(dir);
		const lines = readFileSync(join(dir, ".husky", "post-commit"), "utf8").trimEnd().split("\n");
		expect(lines.at(-1)).toContain("opx hook post-commit");
		expect(lines.at(-2)).toBe("fi");
		rmSync(dir, { recursive: true });
	});

	itPosix("makes a new hook executable", () => {
		const dir = tmp();
		expect(mode(installPostCommitHook(dir).path)).toBe(0o755);
		rmSync(dir, { recursive: true });
	});

	itPosix("makes an existing hook executable when it adds the line", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".husky"), { recursive: true });
		writeFileSync(join(dir, ".husky", "post-commit"), "#!/usr/bin/env sh\necho hi\n", { encoding: "utf8", mode: 0o644 });
		expect(mode(installPostCommitHook(dir).path)).toBe(0o755);
		rmSync(dir, { recursive: true });
	});
});

describe("the post-commit hook", () => {
	const scratch = useScratch();
	const tmpDir = () => scratch.dir("opx-hook-run-");

	/**
	 * Run the installed hook in `dir` with fake `opx` and `yarn` commands that
	 * record how they were called, and return what was recorded.
	 */
	async function runHook(dir: string): Promise<string> {
		const fake = join(dir, "fake-bin");
		const record = join(dir, "called");
		mkdirSync(fake);
		mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
		const fakes: [string, string][] = [[join(fake, "yarn"), "yarn"], [join(dir, "node_modules", ".bin", "opx"), "opx"]];
		for (const [path, name] of fakes) {
			// Write then rename, so the test never reads a half-written record.
			writeFileSync(path, `#!/bin/sh\necho "${name} $*" > "${record}.tmp" && mv "${record}.tmp" "${record}"\n`);
			chmodSync(path, 0o755);
		}
		const hook = installPostCommitHook(dir).path;
		expect(spawnSync("sh", [hook], { cwd: dir, env: { ...process.env, PATH: `${fake}:${process.env.PATH}` } }).status).toBe(0);
		// The hook runs opx in the background; wait for it.
		for (let i = 0; i < 50 && !existsSync(record); i++) await new Promise((r) => setTimeout(r, 100));
		return readFileSync(record, "utf8").trim();
	}

	itPosix("runs the project's own opx from node_modules/.bin", async () => {
		expect(await runHook(tmpDir())).toBe("opx hook post-commit");
	});

	itPosix("runs opx through yarn in a Yarn Plug'n'Play project, which has no node_modules/.bin", async () => {
		const dir = tmpDir();
		writeFileSync(join(dir, ".pnp.cjs"), "");
		expect(await runHook(dir)).toBe("yarn opx hook post-commit");
	});

	it("upgrades the line an earlier version wrote, in place", () => {
		const dir = tmpDir();
		mkdirSync(join(dir, ".husky"));
		const legacy = '( PATH="node_modules/.bin:$PATH" opx hook post-commit >/dev/null 2>&1 & ) || true';
		writeFileSync(join(dir, ".husky", "post-commit"), `#!/usr/bin/env sh\necho mine\n${legacy}\nexit 0\n`);
		expect(installPostCommitHook(dir).created).toBe(false);
		const contents = readFileSync(join(dir, ".husky", "post-commit"), "utf8");
		expect(contents).not.toContain(legacy);
		expect(contents).toContain("yarn opx hook post-commit");
		expect(contents.startsWith("#!/usr/bin/env sh\necho mine\n")).toBe(true);
		expect(contents.endsWith("exit 0\n")).toBe(true);
	});

	const npx = "( npx --no-install opx hook post-commit >/dev/null 2>&1 & ) || true";

	it("upgrades the npx line the first versions wrote, and leaves the hook's other lines alone", () => {
		const dir = tmpDir();
		mkdirSync(join(dir, ".husky"));
		const lint = "npx --no-install opx lint || true";
		writeFileSync(join(dir, ".husky", "post-commit"), `#!/usr/bin/env sh\n${lint}\n${npx}\n`);
		expect(installPostCommitHook(dir).created).toBe(false);
		const lines = readFileSync(join(dir, ".husky", "post-commit"), "utf8").split("\n");
		expect(lines).toEqual(["#!/usr/bin/env sh", lint, expect.stringContaining("yarn opx hook post-commit"), ""]);
	});

	it("moves an npx line that was appended after a trailing exit above it, so it runs", () => {
		const dir = tmpDir();
		mkdirSync(join(dir, ".husky"));
		writeFileSync(join(dir, ".husky", "post-commit"), `#!/usr/bin/env sh\necho mine\nexit 0\n${npx}\n`);
		installPostCommitHook(dir);
		const lines = readFileSync(join(dir, ".husky", "post-commit"), "utf8").split("\n");
		expect(lines).toEqual(["#!/usr/bin/env sh", "echo mine", expect.stringContaining("yarn opx hook post-commit"), "exit 0", ""]);
	});
});

describe("ensureGitignored", () => {
	it("creates .gitignore and adds the entry", () => {
		const dir = tmp();
		expect(ensureGitignored(dir, ".opx")).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".opx");
		rmSync(dir, { recursive: true });
	});

	it("appends to an existing .gitignore without a trailing newline", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), "node_modules", "utf8");
		expect(ensureGitignored(dir, ".opx")).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.opx\n");
		rmSync(dir, { recursive: true });
	});

	it("returns false when the entry is already present (bare or trailing slash)", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), ".opx\n", "utf8");
		expect(ensureGitignored(dir, ".opx")).toBe(false);

		writeFileSync(join(dir, ".gitignore"), ".opx/\n", "utf8");
		expect(ensureGitignored(dir, ".opx")).toBe(false);
		rmSync(dir, { recursive: true });
	});
});

describe("ensureOpxIgnored", () => {
	it("creates a .gitignore that ignores local files but not the config", () => {
		const dir = tmp();
		expect(ensureOpxIgnored(dir)).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(".opx/*\n!.opx/config.json\n");
		rmSync(dir, { recursive: true });
	});

	it("replaces a bare .opx/ entry that would hide the config", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), "node_modules\n.opx/\ndist\n", "utf8");
		expect(ensureOpxIgnored(dir)).toBe(true);
		const contents = readFileSync(join(dir, ".gitignore"), "utf8");
		expect(contents).not.toMatch(/^\.opx\/$/m);
		expect(contents).toContain("node_modules\ndist\n.opx/*\n!.opx/config.json\n");
		rmSync(dir, { recursive: true });
	});

	it("is idempotent", () => {
		const dir = tmp();
		ensureOpxIgnored(dir);
		expect(ensureOpxIgnored(dir)).toBe(false);
		rmSync(dir, { recursive: true });
	});

	describe("in a git repository", () => {
		const scratch = useScratch();

		/** Whether git ignores a path, per `git check-ignore`. */
		function ignored(repo: string, file: string): boolean {
			return spawnSync("git", ["check-ignore", "-q", file], { cwd: repo }).status === 0;
		}

		it.each([
			["a bare .opx line left above the pattern", ".opx\n.opx/*\n!.opx/config.json\n"],
			["the exception before the pattern", "!.opx/config.json\n.opx/*\n"],
			["a root-anchored /.opx/ line", "/.opx/\n"],
			["a .opx/** line", "node_modules\n.opx/**\n"],
		])("keeps the config tracked when .gitignore has %s", (_, gitignore) => {
			const repo = scratch.repo();
			writeFileSync(join(repo, ".gitignore"), gitignore);
			expect(ignored(repo, ".opx/config.json")).toBe(true);

			expect(ensureOpxIgnored(repo)).toBe(true);
			expect(ignored(repo, ".opx/config.json")).toBe(false);
			expect(ignored(repo, ".opx/state.json")).toBe(true);
			expect(ensureOpxIgnored(repo)).toBe(false);
		});
	});

	it("leaves correctly ordered entries where they are", () => {
		const dir = tmp();
		const gitignore = ".opx/*\n!.opx/config.json\nnode_modules\n";
		writeFileSync(join(dir, ".gitignore"), gitignore, "utf8");
		expect(ensureOpxIgnored(dir)).toBe(false);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(gitignore);
		rmSync(dir, { recursive: true });
	});

	it("keeps CRLF line endings when it rewrites", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), "node_modules\r\n.opx\r\n", "utf8");
		expect(ensureOpxIgnored(dir)).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("node_modules\r\n.opx/*\r\n!.opx/config.json\r\n");
		rmSync(dir, { recursive: true });
	});
});

describe("hookLine", () => {
	it("backgrounds a non-blocking hook and discards its output", () => {
		expect(hookLine(["hook", "pre-push"])).toBe(
			'( if [ -f .pnp.cjs ]; then yarn opx hook pre-push; else PATH="node_modules/.bin:$PATH" opx hook pre-push; fi >/dev/null 2>&1 & ) || true',
		);
	});

	it("runs a blocking hook in the foreground, forwarding git's arguments and its exit code", () => {
		expect(hookLine(["hook", "commit-msg"], true)).toBe(
			'if [ -f .pnp.cjs ]; then yarn opx hook commit-msg "$@"; else PATH="node_modules/.bin:$PATH" opx hook commit-msg "$@"; fi || exit $?',
		);
	});
});

describe("installHook for other hooks", () => {
	const scratch = useScratch();
	const line = hookLine(["hook", "commit-msg"], true);
	const read = (dir: string, name: string): string => readFileSync(join(dir, ".husky", name), "utf8");

	it("creates the hook with our line above a final exit", () => {
		const dir = scratch.dir("opx-hook-");
		const result = installHook(dir, "commit-msg", line);
		expect(result).toMatchObject({ created: true, changed: true });
		expect(read(dir, "commit-msg")).toBe(`#!/usr/bin/env sh\n${line}\nexit 0\n`);
	});

	it("appends to a hook someone else wrote, above its trailing exit, and keeps their lines", () => {
		const dir = scratch.dir("opx-hook-");
		mkdirSync(join(dir, ".husky"));
		writeFileSync(join(dir, ".husky", "commit-msg"), "#!/usr/bin/env sh\nnpx commitlint --edit $1\nexit 0\n");
		expect(installHook(dir, "commit-msg", line)).toMatchObject({ created: false, changed: true });
		expect(read(dir, "commit-msg").split("\n")).toEqual(["#!/usr/bin/env sh", "npx commitlint --edit $1", line, "exit 0", ""]);
	});

	it("leaves a hook alone when it already has our line, or a hand-edited line for the same command", () => {
		const dir = scratch.dir("opx-hook-");
		installHook(dir, "commit-msg", line);
		const before = read(dir, "commit-msg");
		expect(installHook(dir, "commit-msg", line)).toMatchObject({ created: false, changed: false });
		expect(read(dir, "commit-msg")).toBe(before);

		writeFileSync(join(dir, ".husky", "pre-push"), "#!/usr/bin/env sh\nopx hook pre-push || true\n");
		expect(installHook(dir, "pre-push", hookLine(["hook", "pre-push"])).changed).toBe(false);
	});

	it("replaces our line in place when a plugin makes the hook blocking", () => {
		const dir = scratch.dir("opx-hook-");
		installHook(dir, "commit-msg", hookLine(["hook", "commit-msg"]));
		expect(installHook(dir, "commit-msg", line)).toMatchObject({ created: false, changed: true });
		expect(read(dir, "commit-msg")).toBe(`#!/usr/bin/env sh\n${line}\nexit 0\n`);
	});

	itPosix("makes a hook someone else wrote executable", () => {
		const dir = scratch.dir("opx-hook-");
		mkdirSync(join(dir, ".husky"));
		writeFileSync(join(dir, ".husky", "pre-commit"), "#!/usr/bin/env sh\necho hi\n", { mode: 0o644 });
		installHook(dir, "pre-commit", hookLine(["hook", "pre-commit"]));
		expect(mode(join(dir, ".husky", "pre-commit"))).toBe(0o755);
	});
});

describe("removeHook", () => {
	const scratch = useScratch();
	const line = hookLine(["hook", "commit-msg"], true);
	const read = (dir: string): string => readFileSync(join(dir, ".husky", "commit-msg"), "utf8");

	it("deletes a hook that holds only what opx created", () => {
		const dir = scratch.dir("opx-hook-");
		const { path } = installHook(dir, "commit-msg", line);
		expect(removeHook(dir, "commit-msg", line)).toEqual({ removed: true, deleted: true, path });
		expect(existsSync(path)).toBe(false);
	});

	it("takes out only our line, whichever way it blocks, and keeps the rest", () => {
		const dir = scratch.dir("opx-hook-");
		mkdirSync(join(dir, ".husky"));
		writeFileSync(join(dir, ".husky", "commit-msg"), "#!/usr/bin/env sh\nnpx commitlint --edit $1\nexit 0\n");
		installHook(dir, "commit-msg", line);
		expect(removeHook(dir, "commit-msg", hookLine(["hook", "commit-msg"]))).toMatchObject({ removed: true, deleted: false });
		expect(read(dir)).toBe("#!/usr/bin/env sh\nnpx commitlint --edit $1\nexit 0\n");
	});

	it("leaves a hand-written line for the same command, a missing hook, and a hook without our line", () => {
		const dir = scratch.dir("opx-hook-");
		expect(removeHook(dir, "commit-msg", line).removed).toBe(false);
		mkdirSync(join(dir, ".husky"));
		const mine = "#!/usr/bin/env sh\nopx hook commit-msg \"$@\"\n";
		writeFileSync(join(dir, ".husky", "commit-msg"), mine);
		expect(removeHook(dir, "commit-msg", line).removed).toBe(false);
		expect(read(dir)).toBe(mine);
	});
});

describe("a blocking hook run by git", () => {
	const scratch = useScratch();

	/** A repo whose husky hooks run a fake `opx` that records its arguments and exits with `code`. */
	function repoWithFakeOpx(code: number): string {
		const dir = scratch.repo({ "README.txt": "x" });
		const bin = join(dir, "node_modules", ".bin");
		mkdirSync(bin, { recursive: true });
		writeFileSync(join(bin, "opx"), `#!/bin/sh\necho "$*" > "${join(dir, "called")}"\nexit ${code}\n`);
		chmodSync(join(bin, "opx"), 0o755);
		installHook(dir, "commit-msg", hookLine(["hook", "commit-msg"], true));
		spawnSync("git", ["config", "core.hooksPath", ".husky"], { cwd: dir });
		writeFileSync(join(dir, "a.txt"), "a");
		spawnSync("git", ["add", "."], { cwd: dir });
		return dir;
	}

	const commit = (dir: string) => spawnSync("git", ["commit", "-m", "msg"], { cwd: dir, encoding: "utf8" });

	itPosix("stops the commit when opx fails, and hands it git's message file", () => {
		const dir = repoWithFakeOpx(3);
		expect(commit(dir).status).not.toBe(0);
		expect(readFileSync(join(dir, "called"), "utf8")).toMatch(/^hook commit-msg .*COMMIT_EDITMSG/);
	});

	itPosix("lets the commit through when opx passes", () => {
		expect(commit(repoWithFakeOpx(0)).status).toBe(0);
	});
});
