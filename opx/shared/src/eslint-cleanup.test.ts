import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DetectorContext } from "@allons-y/opx";

import { eslintCleanup } from "./eslint-cleanup.js";

const spec = { id: "@acme/opx-lint-x", shortName: "x", bundledDeps: ["eslint", "globals"], from: import.meta.url };
const dirs: string[] = [];

/** A context for a project holding the given empty files, with an optional lint override. */
function ctx(files: string[] = [], override?: string): DetectorContext {
	const cwd = mkdtempSync(join(tmpdir(), "opx-eslint-cleanup-"));
	dirs.push(cwd);
	for (const name of files) writeFileSync(join(cwd, name), "");
	return { cwd, config: { version: 1, lint: override ? { x: override } : {} } } as unknown as DetectorContext;
}

const find = (list: ReturnType<typeof eslintCleanup>, target: string) => list.find((s) => s.target === target);

afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("eslintCleanup", () => {
	it("suggests the packages the plugin bundles, with the version it ships", () => {
		const suggestions = eslintCleanup(ctx(), spec);
		expect(suggestions.filter((s) => s.kind === "dependency").map((s) => s.target)).toEqual(["eslint", "globals"]);
		expect(find(suggestions, "eslint")?.reason).toMatch(/^bundled by @acme\/opx-lint-x at \d+\.\d+\.\d+/);
	});

	it("leaves the version out for a package it cannot find", () => {
		const suggestions = eslintCleanup(ctx(), { ...spec, bundledDeps: ["not-a-real-package-opx"] });
		expect(suggestions[0]?.reason).toBe("bundled by @acme/opx-lint-x");
	});

	it("suggests the legacy config files and package.json keys", () => {
		const suggestions = eslintCleanup(ctx(), spec);
		const of = (kind: string): string[] => suggestions.filter((s) => s.kind === kind).map((s) => s.target);
		expect(of("file")).toEqual(expect.arrayContaining([".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.yml", ".eslintignore"]));
		expect(of("setting")).toEqual(["eslintConfig", "eslintIgnore"]);
	});

	describe("the migrate command", () => {
		it("is offered for a legacy config when no flat config exists", () => {
			const suggestions = eslintCleanup(ctx(), spec);
			expect(find(suggestions, ".eslintrc.json")?.command?.run).toEqual(["npx", "@eslint/migrate-config", ".eslintrc.json"]);
			expect(find(suggestions, ".eslintrc.yml")?.command?.run).toEqual(["npx", "@eslint/migrate-config", ".eslintrc.yml"]);
		});

		it("is withheld when a flat config exists, because the command would overwrite it", () => {
			for (const flat of ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"]) {
				const suggestions = eslintCleanup(ctx([flat]), spec);
				expect(find(suggestions, ".eslintrc.json")?.command).toBeUndefined();
				expect(find(suggestions, ".eslintrc.json")?.hint).toContain("overwrite");
			}
		});

		it("is not offered for files and keys it cannot convert", () => {
			const suggestions = eslintCleanup(ctx(), spec);
			for (const target of [".eslintignore", "eslintConfig", "eslintIgnore"]) expect(find(suggestions, target)?.command).toBeUndefined();
		});
	});

	describe("a lint override", () => {
		it("says opx uses its own config when there is no override", () => {
			const suggestions = eslintCleanup(ctx(), spec);
			expect(find(suggestions, ".eslintrc.json")?.reason).toBe("opx lint uses its own config, not this");
			expect(find(suggestions, ".eslintrc.json")?.hint).toContain("`lint.x`");
		});

		it("names the override file as the place to move rules", () => {
			const suggestions = eslintCleanup(ctx([], "config/eslint.js"), spec);
			expect(find(suggestions, ".eslintrc.json")?.reason).toBe("opx lint uses config/eslint.js, not this");
			expect(find(suggestions, ".eslintrc.json")?.hint).toContain("into config/eslint.js");
			expect(find(suggestions, "eslintConfig")?.hint).toContain("into config/eslint.js");
		});
	});
});
