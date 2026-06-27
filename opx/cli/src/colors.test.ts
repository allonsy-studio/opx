import { jest } from "@jest/globals";

describe("colors (current env)", () => {
	it("exposes the expected style functions and an enabled flag", async () => {
		const { colors } = await import("./colors.js");
		expect(typeof colors.bold).toBe("function");
		expect(typeof colors.dim).toBe("function");
		expect(typeof colors.red).toBe("function");
		expect(typeof colors.green).toBe("function");
		expect(typeof colors.cyan).toBe("function");
		expect(typeof colors.yellow).toBe("function");
		expect(typeof colors.enabled).toBe("boolean");
	});
});

describe("colors enabled via FORCE_COLOR", () => {
	const prevForce = process.env.FORCE_COLOR;
	const prevNoColor = process.env.NO_COLOR;

	beforeEach(() => {
		jest.resetModules();
	});

	afterEach(() => {
		if (prevForce === undefined) delete process.env.FORCE_COLOR;
		else process.env.FORCE_COLOR = prevForce;
		if (prevNoColor === undefined) delete process.env.NO_COLOR;
		else process.env.NO_COLOR = prevNoColor;
	});

	it("wraps text in ANSI codes when FORCE_COLOR=1 and NO_COLOR unset", async () => {
		delete process.env.NO_COLOR;
		process.env.FORCE_COLOR = "1";
		const { colors } = await import("./colors.js");
		expect(colors.enabled).toBe(true);
		expect(colors.bold("x")).toBe("\x1b[1mx\x1b[22m");
		expect(colors.dim("x")).toBe("\x1b[2mx\x1b[22m");
		expect(colors.red("x")).toBe("\x1b[31mx\x1b[39m");
		expect(colors.green("x")).toBe("\x1b[32mx\x1b[39m");
		expect(colors.yellow("x")).toBe("\x1b[33mx\x1b[39m");
		expect(colors.cyan("x")).toBe("\x1b[36mx\x1b[39m");
	});

	it("enables color when FORCE_COLOR=true", async () => {
		delete process.env.NO_COLOR;
		process.env.FORCE_COLOR = "true";
		const { colors } = await import("./colors.js");
		expect(colors.enabled).toBe(true);
	});
});

describe("colors disabled via NO_COLOR", () => {
	const prevForce = process.env.FORCE_COLOR;
	const prevNoColor = process.env.NO_COLOR;

	beforeEach(() => {
		jest.resetModules();
	});

	afterEach(() => {
		if (prevForce === undefined) delete process.env.FORCE_COLOR;
		else process.env.FORCE_COLOR = prevForce;
		if (prevNoColor === undefined) delete process.env.NO_COLOR;
		else process.env.NO_COLOR = prevNoColor;
	});

	it("returns text unchanged when NO_COLOR is set even with FORCE_COLOR", async () => {
		process.env.NO_COLOR = "1";
		process.env.FORCE_COLOR = "1";
		const { colors } = await import("./colors.js");
		expect(colors.enabled).toBe(false);
		expect(colors.bold("x")).toBe("x");
		expect(colors.red("x")).toBe("x");
	});
});
