import { filterPathsByExtension } from "./paths.js";

const JS = new Set([".js", ".ts", ".tsx"]);

describe("filterPathsByExtension", () => {
	it("keeps only files whose extension is owned", () => {
		expect(filterPathsByExtension(["a.ts", "b.json", "c.md", "d.js"], JS)).toEqual(["a.ts", "d.js"]);
	});

	it("keeps directories and extensionless args", () => {
		expect(filterPathsByExtension(["src", ".", "Makefile"], JS)).toEqual(["src", ".", "Makefile"]);
	});

	it("routes simple globs by their extension", () => {
		expect(filterPathsByExtension(["**/*.ts", "**/*.json"], JS)).toEqual(["**/*.ts"]);
	});

	it("keeps ambiguous brace globs for the tool to resolve", () => {
		expect(filterPathsByExtension(["**/*.{ts,json}"], JS)).toEqual(["**/*.{ts,json}"]);
	});

	it("is case-insensitive", () => {
		expect(filterPathsByExtension(["A.TS"], JS)).toEqual(["A.TS"]);
	});

	it("drops files with unowned extensions", () => {
		expect(filterPathsByExtension(["a.css", "b.yml"], JS)).toEqual([]);
	});

	it("returns an empty array for empty input", () => {
		expect(filterPathsByExtension([], JS)).toEqual([]);
	});
});
