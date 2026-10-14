import { Command } from "commander";

import { COMMANDS, selectLoaders } from "./command-loader.js";

describe("selectLoaders", () => {
	it("selects only the invoked command", () => {
		expect(selectLoaders(["lint", "src"])).toEqual([COMMANDS.lint]);
	});

	it("skips leading flags to find the command", () => {
		expect(selectLoaders(["--debug", "scan", "--json"])).toEqual([COMMANDS.scan]);
	});

	it("selects every command when none is given or help is requested", () => {
		expect(selectLoaders([])).toEqual(Object.values(COMMANDS));
		expect(selectLoaders(["--help"])).toEqual(Object.values(COMMANDS));
		expect(selectLoaders(["help", "lint"])).toEqual(Object.values(COMMANDS));
	});

	it("selects every command for an unknown name, including inherited object keys", () => {
		expect(selectLoaders(["bogus"])).toEqual(Object.values(COMMANDS));
		expect(selectLoaders(["constructor"])).toEqual(Object.values(COMMANDS));
		expect(selectLoaders(["toString"])).toEqual(Object.values(COMMANDS));
	});

	it("registers under the same name each command is keyed by", async () => {
		for (const [name, load] of Object.entries(COMMANDS)) {
			const program = new Command();
			(await load()).default(program);
			expect(program.commands.map((command) => command.name())).toEqual([name]);
		}
	});
});
