import type { DetectorContext } from "@allons-y/opx";

/** Where output goes and how it looks. Tests pass their own. */
export type UiOptions = {
	/** Print a line to stdout. */
	out?: (line: string) => void;
	/** Print a line to stderr. */
	err?: (line: string) => void;
	/** Use ANSI colors. Defaults to the terminal's support. */
	color?: boolean;
	/** Use Unicode symbols. Defaults to the terminal's support. */
	unicode?: boolean;
};

/** Colors follow the usual conventions: `NO_COLOR` wins, then `FORCE_COLOR`, then a TTY. */
export function supportsColor(env: NodeJS.ProcessEnv = process.env, isTTY = Boolean(process.stdout.isTTY)): boolean {
	if ("NO_COLOR" in env) return false;
	if (env.FORCE_COLOR === "0" || env.FORCE_COLOR === "false") return false;
	if (env.FORCE_COLOR) return true;
	return isTTY;
}

/** Unicode everywhere except the legacy Windows console. */
export function supportsUnicode(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): boolean {
	if (platform !== "win32") return env.TERM !== "linux";
	return Boolean(env.WT_SESSION || env.CI || env.TERM_PROGRAM === "vscode" || env.TERM === "xterm-256color");
}

const SYMBOLS = {
	unicode: { ok: "✔", skip: "–", warn: "▲", fail: "✖", step: "●", arrow: "→" },
	ascii: { ok: "√", skip: "-", warn: "!", fail: "×", step: "*", arrow: "->" },
};

/** One row of a summary table: cells, already formatted. */
export type Row = string[];

/** Strip ANSI codes to measure what a cell shows. */
const visible = (text: string): number => text.replace(/\x1b\[[0-9;]*m/g, "").length;

/**
 * Build the release plugin's output helpers. Every line is indented two spaces
 * and starts with a status symbol, so a run reads as a checklist.
 */
export function createUi(options: UiOptions = {}) {
	const out = options.out ?? ((line: string) => console.log(line));
	const err = options.err ?? ((line: string) => console.error(line));
	const color = options.color ?? supportsColor();
	const sym = (options.unicode ?? supportsUnicode()) ? SYMBOLS.unicode : SYMBOLS.ascii;
	const paint = (open: number, close: number) => (text: string) => (color ? `\x1b[${open}m${text}\x1b[${close}m` : text);
	const c = { bold: paint(1, 22), dim: paint(2, 22), red: paint(31, 39), green: paint(32, 39), yellow: paint(33, 39), cyan: paint(36, 39) };
	const line = (symbol: string, text: string, detail?: string) => `  ${symbol} ${text}${detail ? `  ${c.dim(detail)}` : ""}`;

	return {
		colors: c,
		symbols: sym,
		/** A section title, such as `opx release · publish`. */
		heading(title: string): void {
			out("");
			out(`  ${c.bold(title)}`);
			out("");
		},
		/** Something about to happen. */
		step(text: string, detail?: string): void {
			out(line(c.cyan(sym.step), text, detail));
		},
		/** Something that worked. */
		ok(text: string, detail?: string): void {
			out(line(c.green(sym.ok), text, detail));
		},
		/** Something deliberately not done, with why. */
		skip(text: string, why?: string): void {
			out(line(c.dim(sym.skip), c.dim(text), why));
		},
		/** Something worth attention that didn't stop the run. */
		warn(text: string, detail?: string): void {
			err(line(c.yellow(sym.warn), c.yellow(text), detail));
		},
		/** Something that failed. */
		fail(text: string, detail?: string): void {
			err(line(c.red(sym.fail), c.red(text), detail));
		},
		/** A follow-up line under the previous one, such as what to run next. */
		hint(text: string): void {
			out(`    ${c.dim(text)}`);
		},
		/** A blank line between sections. */
		gap(): void {
			out("");
		},
		/** An aligned table with a dim header row. */
		table(header: Row, rows: Row[]): void {
			const widths = header.map((cell, i) => Math.max(visible(cell), ...rows.map((row) => visible(row[i] ?? ""))));
			const pad = (cell: string, i: number) => cell + " ".repeat(Math.max(0, (widths[i] ?? 0) - visible(cell)));
			out(`  ${c.dim(header.map(pad).join("   ").trimEnd())}`);
			for (const row of rows) out(`  ${row.map(pad).join("   ").trimEnd()}`);
		},
	};
}

/** The helpers' type, for functions that take a `ui`. */
export type Ui = ReturnType<typeof createUi>;

/**
 * Output through the host, as the runner contract asks: lines go to `ctx.write`, problems to
 * `ctx.logger.error`, so a host can buffer and group them.
 */
export function uiFor(ctx: Pick<DetectorContext, "write" | "logger">): Ui {
	return createUi({ out: (line) => ctx.write(`${line}\n`), err: (line) => ctx.logger.error(line) });
}

/** Output straight to the terminal, for code with no host context, such as the changelog generator inside changesets. */
export const ui = createUi();
