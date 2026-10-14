import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

	// Jest gives each test file its own copy of process.env, so check the real
	// behavior the dotenv replacement relies on in a child process.
	it("relies on Node loading new variables without overriding ones already set", () => {
		const file = join(mkdtempSync(join(tmpdir(), "opx-env-")), ".env");
		writeFileSync(file, "OPX_TEST_NEW=from-file\nOPX_TEST_KEEP=from-file\n", "utf8");
		const out = execFileSync(
			process.execPath,
			["-e", "process.loadEnvFile(process.argv[1]); console.log(process.env.OPX_TEST_NEW, process.env.OPX_TEST_KEEP)", file],
			{ encoding: "utf8", env: { ...process.env, OPX_TEST_KEEP: "existing" } },
		);
		expect(out.trim()).toBe("from-file existing");
	});
});
