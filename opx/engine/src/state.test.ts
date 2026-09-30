import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	configPath,
	defaultConfig,
	defaultState,
	readConfig,
	readState,
	statePath,
	writeConfig,
	writeState,
} from "./state.js";

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-state-"));
}

describe("defaults", () => {
	it("provides an empty, versioned default config and state", () => {
		expect(defaultConfig()).toMatchObject({ version: 1, lint: {}, build: {}, release: false, test: false });
		expect(defaultState()).toEqual({ version: 1, deferrals: {} });
	});
});

describe("config read/write", () => {
	it("returns the default config when none exists", () => {
		const dir = tmp();
		expect(readConfig(dir)).toMatchObject({ version: 1, lint: {} });
		rmSync(dir, { recursive: true });
	});

	it("creates the .opx directory and round-trips a config", () => {
		const dir = tmp();
		writeConfig(dir, { ...defaultConfig(), lint: { js: true }, release: true });
		expect(existsSync(configPath(dir))).toBe(true);
		expect(configPath(dir)).toContain(join(".opx", "config.json"));

		const read = readConfig(dir);
		expect(read.lint).toEqual({ js: true });
		expect(read.release).toBe(true);
		rmSync(dir, { recursive: true });
	});

	it("omits empty lint/build but always writes release/test", () => {
		const dir = tmp();
		writeConfig(dir, defaultConfig());
		const raw = JSON.parse(readFileSync(configPath(dir), "utf8"));
		expect(raw.lint).toBeUndefined();
		expect(raw.build).toBeUndefined();
		expect(raw.release).toBe(false);
		expect(raw.test).toBe(false);
		rmSync(dir, { recursive: true });
	});

	it("merges parsed config over defaults", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".opx"), { recursive: true });
		writeFileSync(configPath(dir), JSON.stringify({ version: 1, build: { ts: true } }), "utf8");
		const read = readConfig(dir);
		expect(read.build).toEqual({ ts: true });
		expect(read.lint).toEqual({});
		rmSync(dir, { recursive: true });
	});
});

describe("state read/write", () => {
	it("returns default state when missing and round-trips", () => {
		const dir = tmp();
		expect(readState(dir)).toEqual({ version: 1, deferrals: {} });
		expect(statePath(dir)).toContain(join(".opx", "state.json"));

		writeState(dir, { version: 1, lastScanCommit: "abc", deferrals: { js: { branch: "main", skipUntilDate: "2026-01-01", reason: "later" } } });
		const read = readState(dir);
		expect(read.lastScanCommit).toBe("abc");
		expect(read.deferrals.js?.branch).toBe("main");
		rmSync(dir, { recursive: true });
	});
});

describe("corrupt files", () => {
	it("falls back to default state for empty, malformed, or non-object state", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".opx"), { recursive: true });
		for (const body of ["", "{oops", "[]", "null"]) {
			writeFileSync(statePath(dir), body);
			expect(readState(dir)).toEqual({ version: 1, deferrals: {} });
		}
		rmSync(dir, { recursive: true });
	});

	it("throws an error naming the file for a corrupt config", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".opx"), { recursive: true });
		writeFileSync(configPath(dir), "{oops");
		expect(() => readConfig(dir)).toThrow(`could not read ${configPath(dir)}`);
		writeFileSync(configPath(dir), "[]");
		expect(() => readConfig(dir)).toThrow("expected a JSON object");
		rmSync(dir, { recursive: true });
	});
});
