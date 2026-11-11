import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { composeEslintConfig, eslintConfigHint, scaffoldEslintConfig } from "./eslint-scaffold.js";

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-eslint-"));
}

describe("composeEslintConfig", () => {
	it("returns null when no short names map to config packages", () => {
		expect(composeEslintConfig([])).toBeNull();
		expect(composeEslintConfig(["css", "scss"])).toBeNull();
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

	it("composes the TypeScript detector's config alongside JavaScript's", () => {
		const out = composeEslintConfig(["js", "ts"]);
		expect(out).toContain('import ts from "@allons-y/opx-lint-ts/eslint.config.js";');
		expect(out).toContain("\t...ts,");
	});

	it("filters out unknown names while keeping known ones", () => {
		const out = composeEslintConfig(["js", "css"]);
		expect(out).toContain("...js,");
		expect(out).not.toContain("...css,");
	});
});

describe("scaffoldEslintConfig", () => {
	it("returns null and leaves an existing eslint.config.js untouched", () => {
		const dir = tmp();
		mkdirSync(join(dir, "node_modules", "@allons-y", "opx-lint-js"), { recursive: true });
		writeFileSync(join(dir, "eslint.config.js"), "export default [];", "utf8");
		expect(scaffoldEslintConfig(dir, ["js"])).toBeNull();
		expect(readFileSync(join(dir, "eslint.config.js"), "utf8")).toBe("export default [];");
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

describe("eslintConfigHint", () => {
	const withConfig = (text: string, file = "eslint.config.js"): string => {
		const dir = tmp();
		writeFileSync(join(dir, file), text, "utf8");
		return dir;
	};

	it("returns null without a root config or when nothing is missing", () => {
		const none = tmp();
		expect(eslintConfigHint(none, ["ts"])).toBeNull();
		const full = withConfig('import ts from "@allons-y/opx-lint-ts/eslint.config.js";\nexport default [...ts];\n');
		expect(eslintConfigHint(full, ["ts"])).toBeNull();
		expect(eslintConfigHint(full, ["css"])).toBeNull();
		rmSync(none, { recursive: true });
		rmSync(full, { recursive: true });
	});

	it("lists the import and spread an existing config lacks", () => {
		const dir = withConfig('import js from "@allons-y/opx-lint-js/eslint.config.js";\nexport default [...js, { files: ["src/**/*.ts"] }];\n');
		const hint = eslintConfigHint(dir, ["js", "ts"]);
		expect(hint).toContain("eslint.config.js doesn't include the ts config");
		expect(hint).toContain('import ts from "@allons-y/opx-lint-ts/eslint.config.js";');
		expect(hint).toContain("...ts,");
		expect(hint).toContain("spread it into");
		expect(hint).not.toContain("opx-lint-js/eslint.config.js\";\n");
		rmSync(dir, { recursive: true });
	});

	it("renames a binding the config already declares, and names .mjs configs", () => {
		const dir = withConfig('import ts from "typescript-eslint";\nexport default [];\n', "eslint.config.mjs");
		const hint = eslintConfigHint(dir, ["ts", "md"]);
		expect(hint).toContain("eslint.config.mjs doesn't include the ts, md config");
		expect(hint).toContain('import opxTs from "@allons-y/opx-lint-ts/eslint.config.js";');
		expect(hint).toContain("...opxTs,");
		expect(hint).toContain("...md,");
		expect(hint).toContain("spread them into");
		rmSync(dir, { recursive: true });
	});
});
