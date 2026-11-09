import { CONFIG_KEYS, writeConfig } from "@allons-y/opx";
import type { OpxConfig } from "@allons-y/opx";

import { colors } from "./colors.js";
import { CLI_NAME } from "./plugin-kit.js";

/** The warning for keys `writeConfig` left out, or `undefined` when there are none. */
export function droppedKeysMessage(dropped: string[]): string | undefined {
	if (dropped.length === 0) return undefined;
	const list = dropped.map((key) => `"${key}"`).join(", ");
	return `Removed ${dropped.length === 1 ? "a key" : "keys"} opx doesn't know from .${CLI_NAME}/config.json: ${list}. It keeps only ${CONFIG_KEYS.join(", ")}.`;
}

/** Print a warning line to stderr. */
function warnToStderr(message: string): void {
	process.stderr.write(`${colors.yellow("▲")} ${message}\n`);
}

/**
 * Save `.opx/config.json` and warn about any top-level keys it left out.
 *
 * @param cwd - The repository root.
 * @param config - The config to save.
 * @param warn - Shows the warning; defaults to a `▲` line on stderr.
 */
export function saveConfig(cwd: string, config: OpxConfig, warn: (message: string) => void = warnToStderr): void {
	const message = droppedKeysMessage(writeConfig(cwd, config));
	if (message) warn(message);
}
