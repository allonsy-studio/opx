/**
 * Tiny dependency-free ANSI color helper. Colors are enabled when stdout is a
 * TTY (or `FORCE_COLOR` is set) and `NO_COLOR` is not set — matching the
 * conventions most CLIs and CI systems follow.
 */
const enabled =
	!("NO_COLOR" in process.env) &&
	(process.env.FORCE_COLOR === "1" ||
		process.env.FORCE_COLOR === "true" ||
		process.stdout.isTTY === true);

function style(open: number, close: number): (text: string) => string {
	return (text) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : text);
}

export const colors = {
	/** Whether color output is active. */
	enabled,
	bold: style(1, 22),
	dim: style(2, 22),
	red: style(31, 39),
	green: style(32, 39),
	yellow: style(33, 39),
	cyan: style(36, 39),
};
