import { jest } from "@jest/globals";

import { createConsoleLogger } from "./logger.js";

describe("createConsoleLogger", () => {
	it("forwards info/warn/error to the console", () => {
		const log = jest.spyOn(console, "log").mockImplementation(() => {});
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		const logger = createConsoleLogger();

		logger.info("i");
		logger.warn("w");
		logger.error("e");

		expect(log).toHaveBeenCalledWith("i");
		expect(warn).toHaveBeenCalledWith("w");
		expect(error).toHaveBeenCalledWith("e");
	});

	it("gates debug behind the debug option", () => {
		const debug = jest.spyOn(console, "debug").mockImplementation(() => {});

		createConsoleLogger().debug("hidden");
		expect(debug).not.toHaveBeenCalled();

		createConsoleLogger({ debug: true }).debug("shown");
		expect(debug).toHaveBeenCalledWith("shown");
	});
});
