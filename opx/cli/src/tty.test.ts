import { detectMode } from "./tty.js";

describe("detectMode", () => {
	const prev = {
		nonInteractive: process.env.OPX_NONINTERACTIVE,
		ci: process.env.CI,
		isTTY: process.stdout.isTTY,
	};

	afterEach(() => {
		if (prev.nonInteractive === undefined) delete process.env.OPX_NONINTERACTIVE;
		else process.env.OPX_NONINTERACTIVE = prev.nonInteractive;
		if (prev.ci === undefined) delete process.env.CI;
		else process.env.CI = prev.ci;
		Object.defineProperty(process.stdout, "isTTY", { value: prev.isTTY, configurable: true });
	});

	function clearEnv() {
		delete process.env.OPX_NONINTERACTIVE;
		delete process.env.CI;
	}

	it("returns report when forceReport is true", () => {
		clearEnv();
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		expect(detectMode(true)).toBe("report");
	});

	it("returns report when OPX_NONINTERACTIVE is set", () => {
		clearEnv();
		process.env.OPX_NONINTERACTIVE = "1";
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		expect(detectMode(false)).toBe("report");
	});

	it("returns report when CI is set", () => {
		clearEnv();
		process.env.CI = "1";
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		expect(detectMode(false)).toBe("report");
	});

	it("returns report when stdout is not a TTY", () => {
		clearEnv();
		Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
		expect(detectMode(false)).toBe("report");
	});

	it("returns interactive when a TTY with no overrides", () => {
		clearEnv();
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		expect(detectMode(false)).toBe("interactive");
	});
});
