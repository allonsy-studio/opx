import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { OpxConfig, OpxState } from "./detector.js";

const STATE_DIR = ".opx";
const CONFIG_FILE = join(STATE_DIR, "config.json");
const STATE_FILE = join(STATE_DIR, "state.json");

const SCHEMA_URL = "https://unpkg.com/@allons-y/opx/schema/config.json";

export function defaultConfig(): OpxConfig {
	return {
		$schema: SCHEMA_URL,
		version: 1,
		lint: {},
		build: {},
		release: false,
		test: false,
	};
}

export function defaultState(): OpxState {
	return {
		version: 1,
		deferrals: {},
	};
}

export function configPath(cwd: string): string {
	return join(cwd, CONFIG_FILE);
}

export function statePath(cwd: string): string {
	return join(cwd, STATE_FILE);
}

export function readConfig(cwd: string): OpxConfig {
	const path = configPath(cwd);
	if (!existsSync(path)) {
		return defaultConfig();
	}
	const raw = readFileSync(path, "utf8");
	const parsed = JSON.parse(raw) as Partial<OpxConfig>;
	// @todo: deep-merge the default config with the parsed config
	return {
		...defaultConfig(),
		...parsed,
		lint: parsed.lint ? { ...defaultConfig().lint, ...parsed.lint } : {},
		build: parsed.build ? { ...defaultConfig().build, ...parsed.build } : {},
		release: parsed.release ?? defaultConfig().release,
		test: parsed.test ?? defaultConfig().test,
	};
}

export function writeConfig(cwd: string, config: OpxConfig): void {
	const path = configPath(cwd);
	const normalized: OpxConfig = {
		$schema: config.$schema ?? SCHEMA_URL,
		version: 1,
		...(config.lint && Object.keys(config.lint).length > 0 ? { lint: config.lint } : {}),
		...(config.build && Object.keys(config.build).length > 0 ? { build: config.build } : {}),
		...(typeof config.release !== "undefined" ? { release: config.release } : {}),
		...(typeof config.test !== "undefined" ? { test: config.test } : {}),
	};
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function readState(cwd: string): OpxState {
	const path = statePath(cwd);
	if (!existsSync(path)) {
		return defaultState();
	}
	const raw = readFileSync(path, "utf8");
	const parsed = JSON.parse(raw) as Partial<OpxState>;
	return {
		version: 1,
		lastScanCommit: parsed.lastScanCommit,
		deferrals: parsed.deferrals ?? {},
	};
}

export function writeState(cwd: string, state: OpxState): void {
	const path = statePath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
