import { jest } from "@jest/globals";

import { loadLocalEnv } from "./env.js";

describe("loadLocalEnv", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("passes the path through to process.loadEnvFile", () => {
		const load = jest.spyOn(process, "loadEnvFile").mockImplementation(() => {});
		loadLocalEnv("/some/.env");
		loadLocalEnv();
		expect(load.mock.calls).toEqual([["/some/.env"], [undefined]]);
	});

	it("swallows a missing or unreadable file", () => {
		jest.spyOn(process, "loadEnvFile").mockImplementation(() => {
			throw new Error("ENOENT");
		});
		expect(() => loadLocalEnv()).not.toThrow();
	});
});
