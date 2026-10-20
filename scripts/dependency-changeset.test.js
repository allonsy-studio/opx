import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildChangeset, changedDependencies, slugOf, updateChangeset } from "./dependency-changeset.js";

// Keep the developer's own git config, signing, and a leaked GIT_DIR out of the fixtures.
for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) delete process.env[name];
process.env.GIT_CONFIG_GLOBAL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "configs", "empty.gitconfig");
process.env.GIT_CONFIG_NOSYSTEM = "1";

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t.io", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const write = (cwd, file, value) => {
	mkdirSync(dirname(join(cwd, file)), { recursive: true });
	writeFileSync(join(cwd, file), `${JSON.stringify(value, null, "\t")}\n`);
};
const commit = (cwd, message) => {
	git(cwd, "add", ".");
	git(cwd, "commit", "-m", message);
};

/** A repository on `main` with a published package, a private one, and a branch off it. */
function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "opx-depcs-"));
	dirs.push(cwd);
	git(cwd, "init", "-b", "main");
	write(cwd, "pkg/a/package.json", { name: "@s/a", version: "1.0.0", dependencies: { eslint: "10.11.0", globals: "17.13.0" }, devDependencies: { jest: "30.0.0" } });
	write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.11.0" } });
	write(cwd, "pkg/shared/package.json", { name: "shared", private: true, dependencies: { eslint: "10.11.0" } });
	mkdirSync(join(cwd, ".changeset"));
	writeFileSync(join(cwd, ".changeset", "README.md"), "changesets\n");
	commit(cwd, "init");
	git(cwd, "checkout", "-b", "renovate/lint-tools");
	return cwd;
}

const changeset = (cwd) => readFileSync(join(cwd, ".changeset", "renovate-lint-tools.md"), "utf8");

describe("changedDependencies", () => {
	it("finds a moved range, an addition, and a removal", () => {
		const before = { dependencies: { a: "1.0.0", b: "1.0.0" } };
		const after = { dependencies: { a: "1.1.0", c: "2.0.0" } };
		assert.deepEqual(changedDependencies(before, after), [
			{ name: "a", from: "1.0.0", to: "1.1.0" },
			{ name: "b", from: "1.0.0", to: undefined },
			{ name: "c", from: undefined, to: "2.0.0" },
		]);
	});

	it("looks at what a user installs, not at dev dependencies", () => {
		assert.deepEqual(changedDependencies({ devDependencies: { a: "1.0.0" } }, { devDependencies: { a: "2.0.0" } }), []);
		assert.equal(changedDependencies({ peerDependencies: { a: "^1" } }, { peerDependencies: { a: "^2" } }).length, 1);
		assert.equal(changedDependencies({ optionalDependencies: {} }, { optionalDependencies: { a: "1.0.0" } }).length, 1);
	});

	it("reports nothing when nothing moved", () => {
		assert.deepEqual(changedDependencies({ dependencies: { a: "1.0.0" } }, { dependencies: { a: "1.0.0" } }), []);
		assert.deepEqual(changedDependencies(undefined, {}), []);
	});
});

describe("buildChangeset", () => {
	it("is empty when no package changed", () => {
		assert.equal(buildChangeset([]), "");
	});

	it("names each package once as a patch and lists a shared change once", () => {
		const change = { name: "eslint", from: "10.11.0", to: "10.12.0" };
		const text = buildChangeset([
			{ name: "@s/a", changes: [change, { name: "globals", from: "17.13.0", to: "17.14.0" }] },
			{ name: "@s/b", changes: [change, { name: "x", from: undefined, to: "1.0.0" }, { name: "y", from: "1.0.0", to: undefined }] },
		]);
		assert.equal(text, '---\n"@s/a": patch\n"@s/b": patch\n---\n\nUpdate dependencies: eslint 10.11.0 → 10.12.0, globals 17.13.0 → 17.14.0, add x 1.0.0, remove y.\n');
	});
});

describe("slugOf", () => {
	it("turns a branch name into a file name", () => {
		assert.equal(slugOf("renovate/plugin-tools"), "renovate-plugin-tools");
		assert.equal(slugOf("Renovate/@scope/Pkg_1.2"), "renovate-scope-pkg-1-2");
		assert.equal(slugOf("../../etc/passwd"), "etc-passwd");
		assert.equal(slugOf("a".repeat(200)).length, 80);
	});
});

describe("updateChangeset", () => {
	it("writes a patch changeset for each published package whose shipped dependencies changed", () => {
		const cwd = fixture();
		write(cwd, "pkg/a/package.json", { name: "@s/a", version: "1.0.0", dependencies: { eslint: "10.12.0", globals: "17.13.0" }, devDependencies: { jest: "30.0.0" } });
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.12.0" } });
		write(cwd, "pkg/shared/package.json", { name: "shared", private: true, dependencies: { eslint: "10.12.0" } });
		commit(cwd, "bump");

		assert.match(updateChangeset(cwd, "main", "renovate/lint-tools"), /^Wrote \.changeset\/renovate-lint-tools\.md for @s\/a, @s\/b\.$/);
		assert.equal(changeset(cwd), '---\n"@s/a": patch\n"@s/b": patch\n---\n\nUpdate dependencies: eslint 10.11.0 → 10.12.0.\n');
	});

	it("leaves the file alone when run again", () => {
		const cwd = fixture();
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.12.0" } });
		commit(cwd, "bump");
		updateChangeset(cwd, "main", "renovate/lint-tools");
		assert.match(updateChangeset(cwd, "main", "renovate/lint-tools"), /is up to date\.$/);
	});

	it("rewrites the file when the update changes", () => {
		const cwd = fixture();
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.12.0" } });
		commit(cwd, "bump");
		updateChangeset(cwd, "main", "renovate/lint-tools");
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.13.0" } });
		commit(cwd, "bump again");
		updateChangeset(cwd, "main", "renovate/lint-tools");
		assert.match(changeset(cwd), /eslint 10\.11\.0 → 10\.13\.0/);
	});

	it("writes nothing for dev dependencies, private packages, or other fields", () => {
		const cwd = fixture();
		write(cwd, "pkg/a/package.json", { name: "@s/a", version: "1.0.1", dependencies: { eslint: "10.11.0", globals: "17.13.0" }, devDependencies: { jest: "31.0.0" } });
		write(cwd, "pkg/shared/package.json", { name: "shared", private: true, dependencies: { eslint: "10.12.0" } });
		commit(cwd, "dev only");
		assert.equal(updateChangeset(cwd, "main", "renovate/lint-tools"), "No shipped dependency changed.");
		assert.equal(existsSync(join(cwd, ".changeset", "renovate-lint-tools.md")), false);
	});

	it("removes the file once the update no longer changes a shipped dependency", () => {
		const cwd = fixture();
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.12.0" } });
		commit(cwd, "bump");
		updateChangeset(cwd, "main", "renovate/lint-tools");
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.11.0" } });
		commit(cwd, "back");
		assert.match(updateChangeset(cwd, "main", "renovate/lint-tools"), /^Removed /);
		assert.equal(existsSync(join(cwd, ".changeset", "renovate-lint-tools.md")), false);
	});

	it("measures from the merge base, so new commits on main do not count", () => {
		const cwd = fixture();
		git(cwd, "checkout", "main");
		write(cwd, "pkg/a/package.json", { name: "@s/a", version: "1.0.0", dependencies: { eslint: "10.20.0", globals: "17.13.0" }, devDependencies: { jest: "30.0.0" } });
		commit(cwd, "main moved on");
		git(cwd, "checkout", "renovate/lint-tools");
		write(cwd, "pkg/b/package.json", { name: "@s/b", version: "1.0.0", dependencies: { eslint: "10.12.0" } });
		commit(cwd, "bump");
		updateChangeset(cwd, "main", "renovate/lint-tools");
		assert.match(changeset(cwd), /^---\n"@s\/b": patch\n---/);
	});

	it("needs a branch name", () => {
		assert.throws(() => updateChangeset(fixture(), "main", "///"), /branch name/);
	});
});
