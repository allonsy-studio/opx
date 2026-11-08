import { jest } from "@jest/globals";
import type { Command } from "commander";

/** Stands in for the real commands: one `boom` command that throws what the test sets. */
let thrown: unknown;
const selectLoaders = jest.fn(() => [
	async () => ({
		default: (program: Command) => {
			program.command("boom").action(() => {
				throw thrown;
			});
		},
	}),
]);
jest.unstable_mockModule("./command-loader.js", () => ({ selectLoaders }));

describe("the opx binary", () => {
	const saved = { argv: process.argv, code: process.exitCode };
	let error: ReturnType<typeof jest.spyOn>;

	/** Load the entry point fresh with these arguments, as running `opx ...argv` would. */
	const runCli = async (...argv: string[]): Promise<void> => {
		process.argv = ["node", "opx", ...argv];
		jest.resetModules();
		await import("./index.js");
	};

	beforeEach(() => {
		error = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		jest.restoreAllMocks();
		process.argv = saved.argv;
		process.exitCode = saved.code;
	});

	it("selects commands from the arguments after the script", async () => {
		thrown = new Error("kaboom");
		await runCli("boom");
		expect(selectLoaders).toHaveBeenCalledWith(["boom"]);
	});

	it("prints a one-line message and sets exit code 1 when a command throws", async () => {
		thrown = new Error("kaboom");
		await runCli("boom");
		expect(error).toHaveBeenCalledWith("opx: kaboom");
		expect(process.exitCode).toBe(1);
	});

	it("prints the stack trace with --debug", async () => {
		thrown = new Error("kaboom");
		await runCli("--debug", "boom");
		expect(error).toHaveBeenCalledWith(`opx: ${(thrown as Error).stack}`);
		expect(process.exitCode).toBe(1);
	});

	it("prints a thrown non-Error as text, even with --debug", async () => {
		thrown = "plain failure";
		await runCli("--debug", "boom");
		expect(error).toHaveBeenCalledWith("opx: plain failure");
		expect(process.exitCode).toBe(1);
	});
});
