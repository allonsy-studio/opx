import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Block = { files?: string[]; ignores?: string[]; rules?: Record<string, unknown> };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

describe("bundled eslint.config.js", () => {
	it("is exposed at @allons-y/opx-lint-js/eslint.config.js and published", () => {
		const target = pkg.exports["./eslint.config.js"];
		expect(existsSync(resolve(ROOT, target))).toBe(true);
		expect(pkg.files).toContain("eslint.config.js");
	});

	it("exports a flat config array that can be spread into another config", async () => {
		const config = (await import(pathToFileURL(resolve(ROOT, "eslint.config.js")).href)).default;
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
		for (const block of config) expect(typeof block).toBe("object");
	});

	it("scopes every rule block to files so it composes with the other opx configs", async () => {
		const config = (await import(pathToFileURL(resolve(ROOT, "eslint.config.js")).href)).default as Block[];
		for (const block of config.filter((b) => b.rules)) expect(block.files?.length).toBeGreaterThan(0);
	});
});
