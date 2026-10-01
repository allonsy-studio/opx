import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureGitignored, ensureOpxIgnored, installPostCommitHook } from "./hooks.js";

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-hooks-"));
}

describe("installPostCommitHook", () => {
	it("creates a new post-commit hook", () => {
		const dir = tmp();
		const result = installPostCommitHook(dir);
		expect(result.created).toBe(true);
		expect(readFileSync(result.path, "utf8")).toContain("opx hook post-commit");
		rmSync(dir, { recursive: true });
	});

	it("is idempotent when the marker is already present", () => {
		const dir = tmp();
		const first = installPostCommitHook(dir);
		const before = readFileSync(first.path, "utf8");
		const result = installPostCommitHook(dir);
		expect(result.created).toBe(false);
		expect(readFileSync(result.path, "utf8")).toBe(before);
		rmSync(dir, { recursive: true });
	});

	it("does not append the line again to a hook that already has it", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".husky"), { recursive: true });
		writeFileSync(join(dir, ".husky", "post-commit"), "#!/usr/bin/env sh\necho hi\n", "utf8");
		installPostCommitHook(dir);
		const once = readFileSync(join(dir, ".husky", "post-commit"), "utf8");
		installPostCommitHook(dir);
		const twice = readFileSync(join(dir, ".husky", "post-commit"), "utf8");
		expect(twice).toBe(once);
		expect(twice.match(/opx hook post-commit/g)).toHaveLength(1);
		rmSync(dir, { recursive: true });
	});

	it("appends to an existing hook that lacks the marker", () => {
		const dir = tmp();
		mkdirSync(join(dir, ".husky"), { recursive: true });
		writeFileSync(join(dir, ".husky", "post-commit"), "#!/usr/bin/env sh\necho hi\n", "utf8");
		const result = installPostCommitHook(dir);
		expect(result.created).toBe(false);
		const contents = readFileSync(result.path, "utf8");
		expect(contents).toContain("echo hi");
		expect(contents).toContain("opx hook post-commit");
		rmSync(dir, { recursive: true });
	});
});

describe("ensureGitignored", () => {
	it("creates .gitignore and adds the entry", () => {
		const dir = tmp();
		expect(ensureGitignored(dir, ".opx")).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".opx");
		rmSync(dir, { recursive: true });
	});

	it("appends to an existing .gitignore without a trailing newline", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), "node_modules", "utf8");
		expect(ensureGitignored(dir, ".opx")).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.opx\n");
		rmSync(dir, { recursive: true });
	});

	it("returns false when the entry is already present (bare or trailing slash)", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), ".opx\n", "utf8");
		expect(ensureGitignored(dir, ".opx")).toBe(false);

		writeFileSync(join(dir, ".gitignore"), ".opx/\n", "utf8");
		expect(ensureGitignored(dir, ".opx")).toBe(false);
		rmSync(dir, { recursive: true });
	});
});

describe("ensureOpxIgnored", () => {
	it("creates a .gitignore that ignores local files but not the config", () => {
		const dir = tmp();
		expect(ensureOpxIgnored(dir)).toBe(true);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(".opx/*\n!.opx/config.json\n");
		rmSync(dir, { recursive: true });
	});

	it("replaces a bare .opx/ entry that would hide the config", () => {
		const dir = tmp();
		writeFileSync(join(dir, ".gitignore"), "node_modules\n.opx/\ndist\n", "utf8");
		expect(ensureOpxIgnored(dir)).toBe(true);
		const contents = readFileSync(join(dir, ".gitignore"), "utf8");
		expect(contents).not.toMatch(/^\.opx\/$/m);
		expect(contents).toContain("node_modules\ndist\n.opx/*\n!.opx/config.json\n");
		rmSync(dir, { recursive: true });
	});

	it("is idempotent", () => {
		const dir = tmp();
		ensureOpxIgnored(dir);
		expect(ensureOpxIgnored(dir)).toBe(false);
		rmSync(dir, { recursive: true });
	});
});
