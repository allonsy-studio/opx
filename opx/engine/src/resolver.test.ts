import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { pathToFileURL } from "node:url";

import { packageEntry, resolvePackageEntry, resolveTool } from "./resolver.js";

const dirs: string[] = [];

/** A host project with the given packages installed under `node_modules`. */
function host(...packages: string[]): string {
	/** Real path, since Node resolves through symlinks such as macOS /var. */
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "opx-resolve-")));
	dirs.push(dir);
	for (const name of packages) {
		mkdirSync(join(dir, "node_modules", name), { recursive: true });
		writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
	}
	return dir;
}

/** A bundled require that records what it was asked for and answers from a fixed path. */
function bundled(): { resolve(request: string): string; requests: string[] } {
	const requests: string[] = [];
	return { requests, resolve: (request) => (requests.push(request), `/bundled/node_modules/${request}`) };
}

afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("resolveTool", () => {
	it("prefers the host project's copy and does not ask the bundled require", () => {
		const dir = host("some-tool");
		const req = bundled();
		expect(resolveTool("some-tool", dir, req)).toEqual({ source: "host", packagePath: join(dir, "node_modules", "some-tool", "package.json") });
		expect(req.requests).toEqual([]);
	});

	it("falls back to the bundled copy when the host lacks the tool", () => {
		const req = bundled();
		expect(resolveTool("some-tool", host("other-tool"), req)).toEqual({ source: "bundled", packagePath: "/bundled/node_modules/some-tool/package.json" });
		expect(req.requests).toEqual(["some-tool/package.json"]);
	});

	it("throws when neither the host nor the bundle has the tool", () => {
		const missing = { resolve: (request: string): string => { throw new Error(`Cannot find module '${request}'`); } };
		expect(() => resolveTool("some-tool", host(), missing)).toThrow("Cannot find module 'some-tool/package.json'");
	});
});

describe("packageEntry", () => {
	it("picks the import target of the package root from exports", () => {
		expect(packageEntry({ exports: "./a.js" })).toBe("./a.js");
		expect(packageEntry({ exports: { ".": "./a.js", "./other": "./b.js" } })).toBe("./a.js");
		expect(packageEntry({ exports: { ".": { types: "./a.d.ts", import: "./a.js" } }, main: "./main.cjs" })).toBe("./a.js");
		expect(packageEntry({ exports: { import: "./a.js", require: "./a.cjs" } })).toBe("./a.js");
		expect(packageEntry({ exports: { ".": { node: { import: "./node.js" }, default: "./any.js" } } })).toBe("./node.js");
		expect(packageEntry({ exports: { ".": [{ require: "./a.cjs" }, "./fallback.js"] } })).toBe("./fallback.js");
	});

	it("falls back to main, then index.js, when exports has no import target", () => {
		expect(packageEntry({ exports: { ".": { require: "./a.cjs" } }, main: "./main.js" })).toBe("./main.js");
		expect(packageEntry({ exports: { ".": [{ require: "./a.cjs" }] }, main: "./main.js" })).toBe("./main.js");
		expect(packageEntry({ main: "./main.js" })).toBe("./main.js");
		expect(packageEntry({})).toBe("index.js");
	});
});

describe("resolvePackageEntry", () => {
	it("returns the entry's file URL from the nearest node_modules, searching upward", () => {
		const dir = host("pkg");
		writeFileSync(join(dir, "node_modules", "pkg", "package.json"), JSON.stringify({ name: "pkg", exports: { ".": { import: "./bin/index.js" } } }));
		const nested = join(dir, "packages", "app");
		mkdirSync(nested, { recursive: true });
		expect(resolvePackageEntry("pkg", nested)).toBe(pathToFileURL(join(dir, "node_modules", "pkg", "bin", "index.js")).href);
	});

	it("returns undefined when no node_modules copy exists", () => {
		expect(resolvePackageEntry("not-installed-xyz", host())).toBeUndefined();
	});
});
