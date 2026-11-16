import { PLUGIN_CATALOG, isShipped, isStaticTask, loaderEntry, tasksFor } from "./plugin-catalog.js";

describe("PLUGIN_CATALOG", () => {
	it("gives every entry at least one package", () => {
		for (const entry of PLUGIN_CATALOG) expect(entry.packages.length).toBeGreaterThan(0);
	});

	it("has unique short names", () => {
		const names = PLUGIN_CATALOG.map((e) => e.shortName);
		expect(new Set(names).size).toBe(names.length);
	});

	it("gives each file extension to one plugin only", () => {
		const all = PLUGIN_CATALOG.flatMap((e) => [...e.extensions]);
		expect(new Set(all).size).toBe(all.length);
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

describe("task helpers", () => {
	it("derives the tasks a plugin provides", () => {
		expect(tasksFor("js")).toEqual(["lint"]);
		expect(tasksFor("ts")).toEqual(["lint"]);
		expect(tasksFor("somethingElse")).toEqual([]);
	});

	it("gives format the lint task even though its package isn't named opx-lint-*", () => {
		expect(tasksFor("format")).toEqual(["lint"]);
	});

	it("loads catalog plugins by the package the catalog names, and others by convention", () => {
		expect(loaderEntry("lint", "format")).toBe("@allons-y/opx-format");
		expect(loaderEntry("lint", "js")).toBe("lint-js");
		expect(loaderEntry("build", "format")).toBe("build-format");
		expect(loaderEntry("lint", "css")).toBe("lint-css");
		expect(loaderEntry("lint", "@acme/opx-plugin-x")).toBe("@acme/opx-plugin-x");
	});

	it("identifies static tasks and shipped plugins", () => {
		expect(isStaticTask("release")).toBe(true);
		expect(isStaticTask("js")).toBe(false);
		expect(isShipped("js")).toBe(true);
		expect(isShipped("ts")).toBe(true);
		expect(isShipped("css")).toBe(false);
	});
});
