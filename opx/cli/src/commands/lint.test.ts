import { jest } from "@jest/globals";

import type { Detector, DetectorContext } from "@allons-y/opx";
import { Command } from "commander";

const buildContext = jest.fn<(options: { cwd: string; fix?: boolean }) => DetectorContext>();
jest.unstable_mockModule("../context.js", () => ({ buildContext }));

const { default: builtIns } = await import("../built-in.js");
const { default: register, runLintCommand } = await import("./lint.js");

function ctx(fix = false): DetectorContext {
	return {
		cwd: process.cwd(),
		fileTypes: new Set<string>(),
		hostPkg: {},
		pkgManager: "npm",
		config: { version: 1, lint: {}, build: {}, release: false, test: false },
		state: { version: 1, deferrals: {} },
		branch: "main",
		logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
		dryRun: false,
		fix,
		write: () => {},
	} as unknown as DetectorContext;
}

function detector(over: Partial<Detector>): Detector {
	return { id: "x", shortName: "x", displayName: "X", concern: "lint", ...over } as unknown as Detector;
}

describe("runLintCommand", () => {
	let load: ReturnType<typeof jest.spyOn>;
	let log: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		jest.spyOn(process.stdout, "write").mockImplementation(() => true);
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		load = jest.spyOn(builtIns, "load");
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("returns 0 and points at init when no linters are enabled", async () => {
		load.mockResolvedValue([]);
		expect(await runLintCommand(ctx(), [])).toBe(0);
		expect(log.mock.calls.flat().join(" ")).toContain("no linters are detected");
	});

	it("runs only lint-concern detectors", async () => {
		const lint = jest.fn(async () => 0);
		const build = jest.fn(async () => 0);
		const release = jest.fn(async () => 0);
		load.mockResolvedValue([
			detector({ shortName: "js", concern: "lint", run: lint }),
			detector({ shortName: "bundle", concern: "build", run: build }),
			detector({ shortName: "release", concern: "release", run: release }),
		]);
		expect(await runLintCommand(ctx(), [])).toBe(0);
		expect(lint).toHaveBeenCalledTimes(1);
		expect(build).not.toHaveBeenCalled();
		expect(release).not.toHaveBeenCalled();
	});

	it("forwards paths and flags to every runner", async () => {
		const first = jest.fn<NonNullable<Detector["run"]>>().mockResolvedValue(0);
		const second = jest.fn<NonNullable<Detector["run"]>>().mockResolvedValue(0);
		load.mockResolvedValue([detector({ shortName: "a", run: first }), detector({ shortName: "b", run: second })]);
		await runLintCommand(ctx(), ["src", "README.md"]);
		expect(first.mock.calls[0]?.[1]).toEqual(["src", "README.md"]);
		expect(second.mock.calls[0]?.[1]).toEqual(["src", "README.md"]);
	});

	describe("the lint command", () => {
		/** Run `opx lint ...argv` through commander, as the binary does. */
		const run = async (...argv: string[]): Promise<void> => {
			const program = new Command().exitOverride();
			register(program);
			await program.parseAsync(["node", "opx", "lint", ...argv]);
		};
		let exit: ReturnType<typeof jest.spyOn>;

		beforeEach(() => {
			exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
			buildContext.mockImplementation(({ fix = false }) => ctx(fix));
		});

		it("builds the context for the cwd with --fix, and exits with the lint result", async () => {
			load.mockResolvedValue([detector({ run: async (c: DetectorContext) => (c.fix ? 4 : 0) })]);
			await run("--fix");
			expect(buildContext).toHaveBeenCalledWith({ cwd: process.cwd(), fix: true });
			expect(exit).toHaveBeenCalledWith(4);
		});

		it("defaults --fix to false", async () => {
			load.mockResolvedValue([]);
			await run();
			expect(buildContext).toHaveBeenCalledWith({ cwd: process.cwd(), fix: false });
			expect(exit).toHaveBeenCalledWith(0);
		});

		it("forwards paths and unknown flags to the runners in order", async () => {
			const runner = jest.fn<NonNullable<Detector["run"]>>().mockResolvedValue(0);
			load.mockResolvedValue([detector({ run: runner })]);
			await run("src", "README.md", "--max-warnings", "0");
			expect(runner.mock.calls[0]?.[1]).toEqual(["src", "README.md", "--max-warnings", "0"]);
		});
	});
});
