import { jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

// Controls how the mocked spawn behaves for the next call.
let spawnBehavior: { code?: number; error?: Error } = { code: 0 };
const spawnCalls: Array<{ cmd: string; args: string[]; opts: unknown }> = [];

const spawn = jest.fn((cmd: string, args: string[], opts: unknown) => {
	spawnCalls.push({ cmd, args, opts });
	const ee = new EventEmitter();
	const behavior = spawnBehavior;
	queueMicrotask(() => {
		if (behavior.error) ee.emit("error", behavior.error);
		else ee.emit("close", behavior.code ?? 0);
	});
	return ee;
});

jest.unstable_mockModule("node:child_process", () => ({
	__esModule: true,
	spawn,
}));

const { init, runRelease } = await import("./runner.js");

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-rel-"));
}

function ctx(cwd: string): DetectorContext {
	return { cwd, config: { version: 1, release: true } } as unknown as DetectorContext;
}

beforeEach(() => {
	spawnBehavior = { code: 0 };
	spawnCalls.length = 0;
});

describe("init baseBranch", () => {
	it("uses the repository's own default branch", () => {
		const dir = tmp();
		try {
			mkdirSync(join(dir, ".git", "refs", "heads"), { recursive: true });
			writeFileSync(join(dir, ".git", "refs", "heads", "master"), "abc\n");
			init(ctx(dir));
			expect(JSON.parse(readFileSync(join(dir, ".changeset", "config.json"), "utf8")).baseBranch).toBe("master");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("init", () => {
	it("writes config + README and is idempotent", () => {
		const dir = tmp();
		try {
			const cfg = join(dir, ".changeset", "config.json");
			expect(init(ctx(dir))).toBe(true);
			expect(existsSync(cfg)).toBe(true);
			expect(existsSync(join(dir, ".changeset", "README.md"))).toBe(true);

			const parsed = JSON.parse(readFileSync(cfg, "utf8"));
			expect(parsed.changelog).toBe("@changesets/cli/changelog");
			expect(parsed.baseBranch).toBe("main");

			// No git repository here, so it falls back to main.
			// Second call: config already present → returns false.
			expect(init(ctx(dir))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runRelease", () => {
	it("'init' performs only the lightweight setup and never spawns", async () => {
		const dir = tmp();
		try {
			const code = await runRelease(ctx(dir), ["init"]);
			expect(code).toBe(0);
			expect(existsSync(join(dir, ".changeset", "config.json"))).toBe(true);
			expect(spawn).not.toHaveBeenCalled();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("with no args forwards 'status' to the changesets CLI and resolves 0", async () => {
		const dir = tmp();
		try {
			const code = await runRelease(ctx(dir), []);
			expect(code).toBe(0);
			expect(spawn).toHaveBeenCalledTimes(1);
			const call = spawnCalls[0]!;
			expect(call.args[0]).toMatch(/@changesets[\\/]+cli[\\/]+bin\.js$/);
			expect(call.args.slice(1)).toEqual(["status"]);
			expect(call.opts).toMatchObject({ cwd: dir, stdio: "inherit" });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("forwards a non-interactive subcommand + args verbatim", async () => {
		const dir = tmp();
		try {
			await runRelease(ctx(dir), ["version", "--snapshot", "canary"]);
			expect(spawnCalls[0]!.args.slice(1)).toEqual(["version", "--snapshot", "canary"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("handles 'add' natively and never spawns the changesets CLI", async () => {
		const dir = tmp();
		const spy = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			// No flags + no TTY in the test runner: opx refuses rather than spawning interactive `changeset add`.
			const code = await runRelease(ctx(dir), ["add"]);
			expect(code).toBe(1);
			expect(spawn).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});


	it("resolves to the child's non-zero exit code", async () => {
		const dir = tmp();
		try {
			spawnBehavior = { code: 1 };
			expect(await runRelease(ctx(dir), ["status"])).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("resolves 0 when the child closes with a null exit code", async () => {
		const dir = tmp();
		try {
			spawnBehavior = { code: undefined };
			expect(await runRelease(ctx(dir), ["status"])).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("resolves to 1 when the child emits an error", async () => {
		const dir = tmp();
		const spy = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			spawnBehavior = { error: new Error("boom") };
			expect(await runRelease(ctx(dir), ["status"])).toBe(1);
			expect(spy).toHaveBeenCalledWith(expect.stringContaining("boom"));
		} finally {
			spy.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
