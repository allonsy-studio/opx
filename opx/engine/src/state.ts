import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { OpxConfig, OpxState } from "./detector.js";

const CONFIG_FILE = "opx.config.json";
const STATE_DIR = ".opx";
const STATE_FILE = join(STATE_DIR, "state.json");

const SCHEMA_URL = "https://unpkg.com/@allons-y/opx/opx.schema.json";

export function defaultConfig(): OpxConfig {
	return {
		$schema: SCHEMA_URL,
		version: 1,
		lint: [],
		overrides: {},
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
	return {
		...defaultConfig(),
		...parsed,
		lint: parsed.lint ?? [],
		overrides: parsed.overrides ?? {},
	};
}

export function writeConfig(cwd: string, config: OpxConfig): void {
	const path = configPath(cwd);
	const normalized: OpxConfig = {
		$schema: config.$schema ?? SCHEMA_URL,
		version: 1,
		lint: [...new Set(config.lint)].sort(),
		...(config.test ? { test: [...new Set(config.test)].sort() } : {}),
		...(config.build ? { build: [...new Set(config.build)].sort() } : {}),
		...(config.overrides && Object.keys(config.overrides).length > 0
			? { overrides: config.overrides }
			: {}),
	};
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
