import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import { runEslint } from "./runner.js";
import { useScratch } from "shared/testing.js";

const scratch = useScratch();

type Ctx = DetectorContext & { _output: () => string };

/**
 * Make a scratch project with one source file.
 *
 * @param source - The file contents.
 * @param fix - Whether to apply fixes.
 * @returns The context, the file path and the directory.
 */
function setup(source: string, fix = false): { ctx: Ctx; file: string; dir: string } {
	const dir = scratch.dir("opx-lint-js-config-");
	mkdirSync(join(dir, ".opx", "cache", "eslint"), { recursive: true });
	const file = join(dir, "sample.js");
	writeFileSync(file, source);
	let output = "";
	const ctx = {
		cwd: dir,
		config: { version: 1, lint: {} },
		fix,
		write: (c: string) => { output += c; },
		fileTypes: new Set(),
		_output: () => output,
	} as unknown as Ctx;
	return { ctx, file, dir };
}

describe("default config: modern syntax rules", () => {
	const cases: [rule: string, source: string][] = [
		["no-var", "var a = 1;\nexport { a };\n"],
		["prefer-const", "let a = 1;\nexport { a };\n"],
		["prefer-arrow-callback", "export const a = [1].map(function (n) {\n\treturn n * 2;\n});\n"],
		["prefer-template", "const name = \"x\";\nexport const a = \"hi \" + name;\n"],
		["prefer-spread", "const list = [1, 2];\nexport const a = Math.max.apply(Math, list);\n"],
		["prefer-rest-params", "export function a() {\n\treturn Array.from(arguments);\n}\n"],
		["prefer-object-spread", "const o = {};\nexport const a = Object.assign({}, o);\n"],
		["object-shorthand", "const b = 1;\nexport const a = { b: b };\n"],
		["no-unused-vars", "const { a, b } = { a: 1, b: 2 };\nexport { b };\n"],
	];

	it.each(cases)("reports %s as an error", async (rule, source) => {
		const { ctx } = setup(source);
		expect(await runEslint(ctx, ["sample.js"])).toBe(1);
		expect(ctx._output()).toContain(rule);
	});

	it("passes modern ES module code, formatting rules included", async () => {
		const { ctx } = setup([
			"const name = \"x\";",
			"const o = { name };",
			"export const a = [1, 2].map((n) => `${name}-${n}`);",
			"export const b = { ...o, extra: true };",
			"export const c = Math.max(...[1, 2]);",
			"export const d = (...args) => args.length;",
			"export const e = {",
			"\tmethod() {",
			"\t\treturn 1;",
			"\t},",
			"};",
			"",
		].join("\n"));
		expect(await runEslint(ctx, ["sample.js"])).toBe(0);
	});

	it("allows a destructured sibling to go unused (ignoreRestSiblings)", async () => {
		const { ctx } = setup("const { a, ...rest } = { a: 1, b: 2 };\nexport { rest };\n");
		expect(await runEslint(ctx, ["sample.js"])).toBe(0);
	});

	it("does not ban console", async () => {
		const { ctx } = setup("console.log(1);\n");
		expect(await runEslint(ctx, ["sample.js"])).toBe(0);
	});

	it("fixes ES5 idioms into tidy output without fighting the @stylistic rules", async () => {
		const { ctx, file } = setup([
			"var name = 'x';",
			"var o = { name: name };",
			"var a = [1, 2].map(function (n) { return name + '-' + n; });",
			"var b = Object.assign({}, o, { extra: true });",
			"export { a, b };",
			"",
		].join("\n"), true);
		expect(await runEslint(ctx, ["sample.js"])).toBe(0);
		const fixed = readFileSync(file, "utf8");
		expect(fixed).toContain("const name = \"x\";");
		expect(fixed).toContain("const o = { name };");
		expect(fixed).toContain("`${name}-${n}`");
		expect(fixed).toContain("{ ...o, extra: true }");
	});
});
