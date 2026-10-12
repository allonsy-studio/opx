import type { Logger } from "./detector.js";

/**
 * Create a {@link Logger} that writes to the console.
 *
 * @param opts - Logger options.
 * @param opts.debug - Print debug messages too. Defaults to `false`.
 */
export function createConsoleLogger(opts: { debug?: boolean } = {}): Logger {
	return {
		info(msg) {
			console.log(msg);
		},
		warn(msg) {
			console.warn(msg);
		},
		error(msg) {
			console.error(msg);
		},
		debug(msg) {
			if (opts.debug) {
				console.debug(msg);
			}
		},
	};
}
