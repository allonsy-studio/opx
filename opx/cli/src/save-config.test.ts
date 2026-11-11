import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultConfig } from "@allons-y/opx";
import type { OpxConfig } from "@allons-y/opx";
import { useScratch } from "shared/testing.js";

import { droppedKeysMessage, saveConfig } from "./save-config.js";

const scratch = useScratch();

describe("droppedKeysMessage", () => {
	it("names each dropped key and the keys opx keeps", () => {
		expect(droppedKeysMessage(["custom"])).toBe(
			"Removed a key opx doesn't know from .opx/config.json: \"custom\". It keeps only $schema, version, lint, build, release, test.",
		);
		expect(droppedKeysMessage(["a", "b"])).toMatch(/^Removed keys opx doesn't know from \.opx\/config\.json: "a", "b"\./);
	});

	it("is undefined when nothing was dropped", () => {
		expect(droppedKeysMessage([])).toBeUndefined();
	});
});

describe("saveConfig", () => {
	it("writes the config and passes the warning to the given function", () => {
		const dir = scratch.dir();
		const warn = jest.fn();
		saveConfig(dir, { ...defaultConfig(), lint: { js: true }, custom: 1 } as OpxConfig, warn);
		expect(JSON.parse(readFileSync(join(dir, ".opx", "config.json"), "utf8")).lint).toEqual({ js: true });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"custom"'));
	});

	it("stays quiet when nothing was dropped", () => {
		const warn = jest.fn();
		saveConfig(scratch.dir(), defaultConfig(), warn);
		expect(warn).not.toHaveBeenCalled();
	});
});
