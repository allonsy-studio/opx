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

/**
 * Read and parse a JSON object file.
 *
 * @throws An error naming the file when it is empty, malformed, or not an object.
 */
function parseJsonFile<T extends object>(path: string): T {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("expected a JSON object");
		}
		return parsed as T;
	} catch (err) {
		throw new Error(`could not read ${path}: ${(err as Error).message}`, { cause: err });
	}
}

/**
 * Names of the plugins switched on in a task map. A plugin set to `false` is
 * present in the config but disabled, so it is excluded.
 *
 * @param tasks - A `lint` or `build` map from `.opx/config.json`.
 * @returns The enabled plugin short names, in config order.
 */
export function enabledNames(tasks: Record<string, unknown> | undefined): string[] {
	return Object.entries(tasks ?? {}).filter(([, setting]) => setting !== false).map(([name]) => name);
}

export function readConfig(cwd: string): OpxConfig {
	const path = configPath(cwd);
	if (!existsSync(path)) {
		return defaultConfig();
	}
	const parsed = parseJsonFile<Partial<OpxConfig>>(path);
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
	// State is a disposable cache: an unreadable file falls back to defaults.
	let parsed: Partial<OpxState>;
	try {
		parsed = parseJsonFile<Partial<OpxState>>(path);
	} catch {
		return defaultState();
	}
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
