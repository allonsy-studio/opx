import { PLUGIN_CATALOG } from "./plugin-catalog.js";

describe("PLUGIN_CATALOG", () => {
	it("is a non-empty list of well-formed entries", () => {
		expect(PLUGIN_CATALOG.length).toBeGreaterThan(0);
		for (const entry of PLUGIN_CATALOG) {
			expect(typeof entry.shortName).toBe("string");
			expect(entry.shortName.length).toBeGreaterThan(0);
			expect(Array.isArray(entry.packages)).toBe(true);
			expect(entry.packages.length).toBeGreaterThan(0);
			expect(Array.isArray(entry.extensions)).toBe(true);
		}
	});

	it("has unique short names", () => {
		const names = PLUGIN_CATALOG.map((e) => e.shortName);
		expect(new Set(names).size).toBe(names.length);
	});

	it("includes the core file-type and undetectable plugins", () => {
		const names = PLUGIN_CATALOG.map((e) => e.shortName);
		expect(names).toEqual(expect.arrayContaining(["js", "ts", "css", "md", "json", "release", "test"]));
	});

	it("maps js to its lint and build packages and known extensions", () => {
		const js = PLUGIN_CATALOG.find((e) => e.shortName === "js");
		expect(js?.packages).toContain("@allons-y/opx-lint-js");
		expect(js?.packages).toContain("@allons-y/opx-build-js");
		expect(js?.extensions).toEqual(expect.arrayContaining([".js", ".ts", ".tsx"]));
	});

	it("leaves release and test without file extensions", () => {
		expect(PLUGIN_CATALOG.find((e) => e.shortName === "release")?.extensions).toEqual([]);
		expect(PLUGIN_CATALOG.find((e) => e.shortName === "test")?.extensions).toEqual([]);
	});

	it("uses leading-dot, lowercase extensions where present", () => {
		for (const entry of PLUGIN_CATALOG) {
			for (const ext of entry.extensions) {
				expect(ext.startsWith(".")).toBe(true);
				expect(ext).toBe(ext.toLowerCase());
			}
		}
	});
});
