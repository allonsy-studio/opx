import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LINT_JS_UPGRADE, lintJsLintsTypeScript } from "./lint-js-version.js";

describe("lintJsLintsTypeScript", () => {
	const dirs: string[] = [];
	const project = (installed?: string): string => {
		const dir = mkdtempSync(join(tmpdir(), "opx-lintjs-"));
		dirs.push(dir);
		if (installed) {
			const pkgDir = join(dir, "node_modules", "@allons-y", "opx-lint-js");
			mkdirSync(pkgDir, { recursive: true });
			writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "@allons-y/opx-lint-js", version: installed }));
		}
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("reads the installed version first", () => {
		expect(lintJsLintsTypeScript(project("0.1.0-beta.0"), { devDependencies: { "@allons-y/opx-lint-js": "^1.0.0-beta.3" } })).toBe(true);
		expect(lintJsLintsTypeScript(project("1.0.0-beta.3"), { devDependencies: { "@allons-y/opx-lint-js": "^0.1.0-beta.0" } })).toBe(false);
	});

	it("falls back to the declared range when nothing is installed", () => {
		expect(lintJsLintsTypeScript(project(), { devDependencies: { "@allons-y/opx-lint-js": "^0.1.0-beta.0" } })).toBe(true);
		expect(lintJsLintsTypeScript(project(), { dependencies: { "@allons-y/opx-lint-js": "~0.1.0" } })).toBe(true);
		expect(lintJsLintsTypeScript(project(), { devDependencies: { "@allons-y/opx-lint-js": "^1.0.0-beta.1" } })).toBe(false);
		expect(lintJsLintsTypeScript(project(), {})).toBe(false);
	});

	it("upgrades to the first JavaScript-only range", () => {
		expect(LINT_JS_UPGRADE).toBe("@allons-y/opx-lint-js@^1.0.0-beta.1");
	});
});
