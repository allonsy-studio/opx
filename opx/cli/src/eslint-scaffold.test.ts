import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { composeEslintConfig, scaffoldEslintConfig } from "./eslint-scaffold.js";

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-eslint-"));
}

describe("composeEslintConfig", () => {
	it("returns null when no short names map to config packages", () => {
		expect(composeEslintConfig([])).toBeNull();
		expect(composeEslintConfig(["css", "ts"])).toBeNull();
	});

	it("emits imports and spreads for known config-shipping detectors", () => {
		const out = composeEslintConfig(["js", "md"]);
		expect(out).not.toBeNull();
		expect(out).toContain('import js from "@allons-y/opx-lint-js/eslint.config.js";');
		expect(out).toContain('import md from "@allons-y/opx-lint-md/eslint.config.js";');
		expect(out).toContain("\t...js,");
		expect(out).toContain("\t...md,");
		expect(out).toContain("export default [");
	});

	it("filters out unknown names while keeping known ones", () => {
		const out = composeEslintConfig(["js", "css"]);
		expect(out).toContain("...js,");
		expect(out).not.toContain("...css,");
	});
});

describe("scaffoldEslintConfig", () => {
	it("returns null and writes nothing when eslint.config.js already exists", () => {
		const dir = tmp();
		writeFileSync(join(dir, "eslint.config.js"), "export default [];", "utf8");
		expect(scaffoldEslintConfig(dir, ["js"])).toBeNull();
		rmSync(dir, { recursive: true });
	});

	it("returns null when none of the detectors are installed in node_modules", () => {
		const dir = tmp();
		expect(scaffoldEslintConfig(dir, ["js", "md"])).toBeNull();
		expect(existsSync(join(dir, "eslint.config.js"))).toBe(false);
		rmSync(dir, { recursive: true });
	});

	it("writes a config including only installed detectors", () => {
		const dir = tmp();
		mkdirSync(join(dir, "node_modules", "@allons-y", "opx-lint-js"), { recursive: true });
		const written = scaffoldEslintConfig(dir, ["js", "md"]);
		expect(written).toBe(join(dir, "eslint.config.js"));
		const contents = readFileSync(join(dir, "eslint.config.js"), "utf8");
		expect(contents).toContain("...js,");
		expect(contents).not.toContain("...md,");
		rmSync(dir, { recursive: true });
	});
});
