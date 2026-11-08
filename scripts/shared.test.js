import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { pathToFileURL } from "node:url";

import { clean, main, relativeSpecifier, rewriteImports, share, write } from "./shared.js";

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	mock.restoreAll();
});

/** Write files under a directory, creating folders. */
function files(dir, contents) {
	for (const [file, text] of Object.entries(contents)) {
		mkdirSync(dirname(join(dir, file)), { recursive: true });
		writeFileSync(join(dir, file), text);
	}
}

/**
 * A repository with one shared source, used by `lint-a`, and a built `lint-a` and `other`.
 * @returns {{ root: string, targets: Record<string, string[]> }}
 */
function repo() {
	const root = mkdtempSync(join(tmpdir(), "opx-shared-"));
	dirs.push(root);
	files(root, {
		"opx/shared/src/runner.ts": "export const run = (x: number): number => x + 1;\n",
		"opx/lint-a/bin/index.js": 'import { run } from "shared/runner.js";\nexport default run;\n',
		"opx/lint-a/bin/nested/deep.js": "import { run } from 'shared/runner.js';\n",
		"opx/lint-a/bin/index.d.ts": 'export { run } from "shared/runner.js";\n',
		"opx/lint-a/bin/notes.txt": '"shared/runner.js"\n',
		"opx/other/bin/index.js": 'import { run } from "shared/runner.js";\n',
	});
	return { root, targets: { runner: ["lint-a"] } };
}

const read = (root, file) => readFileSync(join(root, file), "utf8");

/** Import a compiled file and call its `run`, proving it's plain JavaScript that exports the shared code. */
const runCompiled = async (root, file) => (await import(`${pathToFileURL(join(root, file)).href}?${Date.now()}`)).run(1);

describe("write", () => {
	it("leaves a file alone when it already holds the content", () => {
		const dir = mkdtempSync(join(tmpdir(), "opx-shared-write-"));
		dirs.push(dir);
		const file = join(dir, "a", "b.js");
		assert.equal(write(file, "x"), true);
		const before = statSync(file).mtimeMs;
		assert.equal(write(file, "x"), false);
		assert.equal(statSync(file).mtimeMs, before);
		assert.equal(write(file, "y"), true);
	});
});

describe("relativeSpecifier", () => {
	it("starts with ./ for a file below, ../ for one above, and uses forward slashes", () => {
		assert.equal(relativeSpecifier("/p/bin/index.js", "/p/bin/shared/runner.js"), "./shared/runner.js");
		assert.equal(relativeSpecifier("/p/bin/nested/deep.js", "/p/bin/shared/runner.js"), "../shared/runner.js");
	});
});

describe("rewriteImports", () => {
	it("replaces quoted specifiers only", () => {
		const text = 'import a from "shared/runner.js";\nimport b from \'shared/runner.js\';\n// shared/runner.js\nimport c from "shared/runner.json";\n';
		assert.equal(
			rewriteImports(text, "shared/runner.js", "./shared/runner.js"),
			'import a from "./shared/runner.js";\nimport b from \'./shared/runner.js\';\n// shared/runner.js\nimport c from "shared/runner.json";\n',
		);
	});
});

describe("share build", () => {
	it("compiles the shared source beside itself, only for packages that use it", async () => {
		const { root, targets } = repo();
		assert.deepEqual(share("build", "opx/other", { root, targets }), []);
		assert.equal(existsSync(join(root, "opx/shared/src/runner.js")), false);

		share("build", "opx/lint-a", { root, targets });
		assert.equal(await runCompiled(root, "opx/shared/src/runner.js"), 2);
	});

	it("writes nothing on a second run", () => {
		const { root, targets } = repo();
		share("build", "opx/lint-a", { root, targets });
		assert.deepEqual(share("build", "opx/lint-a", { root, targets }), []);
	});
});

describe("share inject", () => {
	it("copies the compiled file into bin/shared and points every built import at it", async () => {
		const { root, targets } = repo();
		const declarations = mock.fn();
		share("inject", join(root, "opx/lint-a"), { root, targets, declarations });

		assert.equal(await runCompiled(root, "opx/lint-a/bin/shared/runner.js"), 2);
		assert.equal(read(root, "opx/lint-a/bin/index.js"), 'import { run } from "./shared/runner.js";\nexport default run;\n');
		assert.equal(read(root, "opx/lint-a/bin/nested/deep.js"), "import { run } from '../shared/runner.js';\n");
		assert.equal(read(root, "opx/lint-a/bin/index.d.ts"), 'export { run } from "./shared/runner.js";\n');
		assert.equal(read(root, "opx/lint-a/bin/notes.txt"), '"shared/runner.js"\n');
		assert.deepEqual(declarations.mock.calls[0].arguments, [join(root, "opx/shared/src"), join(root, "opx/lint-a/bin")]);
	});

	it("leaves packages that don't use the shared source untouched", () => {
		const { root, targets } = repo();
		const declarations = mock.fn();
		assert.deepEqual(share("inject", "opx/other", { root, targets, declarations }), []);
		assert.equal(read(root, "opx/other/bin/index.js"), 'import { run } from "shared/runner.js";\n');
		assert.equal(declarations.mock.callCount(), 0);
	});

	it("is safe to run twice", () => {
		const { root, targets } = repo();
		share("inject", "opx/lint-a", { root, targets, declarations: () => {} });
		assert.deepEqual(share("inject", "opx/lint-a", { root, targets, declarations: () => {} }), []);
	});

	it("refuses to inject before the package is built", () => {
		const { root, targets } = repo();
		rmSync(join(root, "opx/lint-a/bin"), { recursive: true });
		assert.throws(() => share("inject", "opx/lint-a", { root, targets, declarations: () => {} }), /lint-a has no bin\/ to inject into; build it first/);
	});
});

describe("clean", () => {
	it("removes the compiled files build wrote, and nothing else", () => {
		const { root, targets } = repo();
		share("build", "opx/lint-a", { root, targets });
		clean({ root, targets });
		assert.equal(existsSync(join(root, "opx/shared/src/runner.js")), false);
		assert.equal(existsSync(join(root, "opx/shared/src/runner.ts")), true);
		clean({ root, targets });
	});
});

describe("main", () => {
	it("runs each mode and returns its exit code", () => {
		const { root, targets } = repo();
		assert.equal(main(["build", "opx/lint-a"], { root, targets }), 0);
		assert.equal(existsSync(join(root, "opx/shared/src/runner.js")), true);
		assert.equal(main(["inject", "opx/lint-a"], { root, targets, declarations: () => {} }), 0);
		assert.equal(main(["clean"], { root, targets }), 0);
		assert.equal(existsSync(join(root, "opx/shared/src/runner.js")), false);
	});

	it("prints usage and returns 1 for anything else", () => {
		const error = mock.method(console, "error", () => {});
		assert.equal(main(["publish", "opx/lint-a"], { root: "/" }), 1);
		assert.equal(main(["build"], { root: "/" }), 1);
		assert.match(String(error.mock.calls[0].arguments[0]), /^usage: node scripts\/shared\.js/);
	});
});
