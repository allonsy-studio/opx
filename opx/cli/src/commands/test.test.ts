import { jest } from "@jest/globals";

import type { Detector, DetectorContext } from "@allons-y/opx";

import builtIns from "../built-in.js";
import { runTestCommand } from "./test.js";

function ctx(): DetectorContext {
	return {
		cwd: process.cwd(),
		fileTypes: new Set<string>(),
		hostPkg: {},
		pkgManager: "npm",
		config: { version: 1, lint: {}, build: {}, release: false, test: true },
		state: { version: 1, deferrals: {} },
		branch: "main",
		logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
		dryRun: false,
		fix: false,
		write: () => {},
	} as unknown as DetectorContext;
}

function detector(over: Partial<Detector>): Detector {
	return { id: "x", shortName: "x", displayName: "X", concern: "test", ...over } as unknown as Detector;
}

describe("runTestCommand", () => {
	let load: ReturnType<typeof jest.spyOn>;
	let log: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		load = jest.spyOn(builtIns, "loadTask");
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns 0 and reports when no test plugin is detected", async () => {
		load.mockResolvedValue({ detectors: [], failures: [] });

		const code = await runTestCommand(ctx(), ["status"]);

		expect(code).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no test plugin is detected");
	});

	it("exits 1 when the release plugin is enabled but can't be loaded", async () => {
		jest.spyOn(process.stderr, "write").mockImplementation(() => true);
		load.mockResolvedValue({ detectors: [], failures: ["broken"] });
		expect(await runTestCommand(ctx(), ["status"])).toBe(1);
		expect(log.mock.calls.flat().join(" ")).not.toContain("no test plugin is detected");
	});

	it("forwards the subcommand + args verbatim, empty included, to the test plugin", async () => {
		const seen: string[][] = [];
		load.mockResolvedValue({ detectors: [
			detector({ run: async (_c, args) => { seen.push(args); return 0; } }),
		], failures: [] });

		const code = await runTestCommand(ctx(), ["add", "--empty"]);
		await runTestCommand(ctx(), []);

		expect(code).toBe(0);
		// No default subcommand is injected; that is the test plugin's job.
		expect(seen).toEqual([["add", "--empty"], []]);
	});

	it("treats a test plugin without a run function as passing", async () => {
		load.mockResolvedValue({ detectors: [detector({ run: undefined })], failures: [] });

		const code = await runTestCommand(ctx(), ["status"]);

		expect(code).toBe(0);
	});

	it("returns the first non-zero exit code across test plugins", async () => {
		load.mockResolvedValue({ detectors: [
			detector({ shortName: "ok", run: async () => 0 }),
			detector({ shortName: "bad", run: async () => 2 }),
		], failures: [] });

		const code = await runTestCommand(ctx(), ["version"]);

		expect(code).toBe(2);
	});

	it("runs test plugins serially so interactive prompts never race for the TTY", async () => {
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
		load.mockResolvedValue({ detectors: [make("a"), make("b")], failures: [] });

		await runTestCommand(ctx(), ["status"]);

		// Serial: "a" fully finishes before "b" starts. (Parallel would interleave
		// to a:start, b:start, a:end, b:end.)
		expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
	});
});
