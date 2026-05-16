import type { Logger } from "./detector.js";

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
