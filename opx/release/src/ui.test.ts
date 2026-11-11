import { createUi, supportsColor, supportsUnicode, uiFor } from "./ui.js";

/** A ui that records its lines instead of printing them. */
function capture(options: { color?: boolean; unicode?: boolean } = {}) {
	const out: string[] = [];
	const err: string[] = [];
	const ui = createUi({ out: (l) => out.push(l), err: (l) => err.push(l), color: false, unicode: true, ...options });
	return { ui, out, err };
}

describe("supportsColor", () => {
	it.each([
		[{ NO_COLOR: "" }, true, false],
		[{ NO_COLOR: "1", FORCE_COLOR: "1" }, false, false],
		[{ FORCE_COLOR: "1" }, false, true],
		[{ FORCE_COLOR: "0" }, true, false],
		[{}, true, true],
		[{}, false, false],
	])("env %j with TTY %s gives %s", (env, tty, expected) => {
		expect(supportsColor(env as NodeJS.ProcessEnv, tty)).toBe(expected);
	});
});

describe("supportsUnicode", () => {
	it.each([
		[{}, "linux", true],
		[{ TERM: "linux" }, "linux", false],
		[{}, "win32", false],
		[{ WT_SESSION: "1" }, "win32", true],
		[{ CI: "true" }, "win32", true],
	])("env %j on %s gives %s", (env, platform, expected) => {
		expect(supportsUnicode(env as NodeJS.ProcessEnv, platform)).toBe(expected);
	});
});

describe("createUi", () => {
	it("prints a checklist line per status, problems on stderr", () => {
		const { ui, out, err } = capture();
		ui.ok("Published", "1.2.0");
		ui.skip("GitHub releases", "no GITHUB_TOKEN");
		ui.step("Pushing tags");
		ui.hint("Next: merge it.");
		ui.warn("Careful");
		ui.fail("Broke", "exit 1");
		expect(out).toEqual(["  ✔ Published  1.2.0", "  – GitHub releases  no GITHUB_TOKEN", "  ● Pushing tags", "    Next: merge it."]);
		expect(err).toEqual(["  ▲ Careful", "  ✖ Broke  exit 1"]);
	});

	it("falls back to ASCII symbols", () => {
		const { ui, out } = capture({ unicode: false });
		ui.ok("Done");
		expect(out).toEqual(["  √ Done"]);
	});

	it("colors only when asked", () => {
		const { ui, out } = capture({ color: true });
		ui.ok("Done");
		expect(out[0]).toBe("  \x1b[32m✔\x1b[39m Done");
	});

	it("aligns table columns by what they show, ignoring color codes", () => {
		const { ui, out } = capture({ color: true });
		ui.table(["Package", "Version"], [[ui.colors.bold("a"), "1.0.0"], ["longer-name", "2.0.0"]]);
		const plain = out.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
		expect(plain).toEqual(["  Package       Version", "  a             1.0.0", "  longer-name   2.0.0"]);
	});

	it("frames a heading with blank lines", () => {
		const { ui, out } = capture();
		ui.heading("opx release · publish");
		expect(out).toEqual(["", "  opx release · publish", ""]);
	});
});

describe("uiFor", () => {
	it("writes lines through the host and problems through its logger", () => {
		const written: string[] = [];
		const errors: string[] = [];
		const ui = uiFor({ write: (chunk) => written.push(chunk), logger: { info() {}, warn() {}, debug() {}, error: (m) => errors.push(m) } });
		ui.ok("Done");
		ui.fail("Broke");
		expect(written).toEqual([expect.stringMatching(/Done\n$/)]);
		expect(errors).toEqual([expect.stringMatching(/Broke$/)]);
	});
});
