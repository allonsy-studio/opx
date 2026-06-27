import { jest } from "@jest/globals";

import type { Detector, DetectorContext } from "@allons-y/opx";

import builtIns from "../built-in.js";
import { runReleaseCommand } from "./release.js";

function ctx(): DetectorContext {
	return {
		cwd: process.cwd(),
		fileTypes: new Set<string>(),
		hostPkg: {},
		pkgManager: "npm",
		config: { version: 1, lint: {}, build: {}, release: true, test: false },
		state: { version: 1, deferrals: {} },
		branch: "main",
		logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
		dryRun: false,
		fix: false,
		write: () => {},
	} as unknown as DetectorContext;
}

function detector(over: Partial<Detector>): Detector {
	return { id: "x", shortName: "x", displayName: "X", concern: "release", ...over } as unknown as Detector;
}

describe("runReleaseCommand", () => {
	let load: ReturnType<typeof jest.spyOn>;
	let log: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		load = jest.spyOn(builtIns, "load");
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns 0 and reports when no releaser is detected", async () => {
		load.mockResolvedValue([]);

		const code = await runReleaseCommand(ctx(), ["status"]);

		expect(code).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no releaser is detected");
	});

	it("ignores detectors whose concern is not release", async () => {
		load.mockResolvedValue([detector({ concern: "build", run: async () => 2 })]);

		const code = await runReleaseCommand(ctx(), ["status"]);

		expect(code).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no releaser is detected");
	});

	it("forwards the subcommand + args verbatim to the releaser", async () => {
		const seen: string[][] = [];
		load.mockResolvedValue([
			detector({ run: async (_c, args) => { seen.push(args); return 0; } }),
		]);

		const code = await runReleaseCommand(ctx(), ["add", "--empty"]);

		expect(code).toBe(0);
		// The command layer does not inject a default subcommand — that is the
		// releaser's job (changesets defaults to `status`).
		expect(seen).toEqual([["add", "--empty"]]);
	});

	it("passes empty args through without a default subcommand", async () => {
		const seen: string[][] = [];
		load.mockResolvedValue([
			detector({ run: async (_c, args) => { seen.push(args); return 0; } }),
		]);

		await runReleaseCommand(ctx(), []);

		expect(seen).toEqual([[]]);
	});

	it("treats a releaser without a run function as passing", async () => {
		load.mockResolvedValue([detector({ run: undefined })]);

		const code = await runReleaseCommand(ctx(), ["status"]);

		expect(code).toBe(0);
	});

	it("returns the first non-zero exit code across releasers", async () => {
		load.mockResolvedValue([
			detector({ shortName: "ok", run: async () => 0 }),
			detector({ shortName: "bad", run: async () => 2 }),
		]);

		const code = await runReleaseCommand(ctx(), ["version"]);

		expect(code).toBe(2);
	});

	it("runs releasers serially so interactive prompts never race for the TTY", async () => {
		const events: string[] = [];
		const make = (name: string) =>
			detector({
				shortName: name,
				run: async () => {
					events.push(`${name}:start`);
					await new Promise((resolve) => setTimeout(resolve, 0));
					events.push(`${name}:end`);
					return 0;
				},
			});
		load.mockResolvedValue([make("a"), make("b")]);

		await runReleaseCommand(ctx(), ["status"]);

		// Serial: "a" fully finishes before "b" starts. (Parallel would interleave
		// to a:start, b:start, a:end, b:end.)
		expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
	});
});
