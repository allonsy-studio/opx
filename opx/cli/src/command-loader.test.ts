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

	it("loads a real command module with a register function", async () => {
		const [load] = selectLoaders(["hook"]);
		expect(typeof (await load!()).default).toBe("function");
	});
});
