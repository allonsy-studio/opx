import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveTool } from "./resolver.js";

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
