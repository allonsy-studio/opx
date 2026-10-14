/**
 * Share source between packages without a runtime dependency.
 *
 * While developing, packages import `opx/shared/<name>.ts` directly. `build`
 * compiles each shared file beside its source so built packages resolve it in
 * the repo. `inject`, run by a package's `prepack`, copies the compiled file
 * into the package's `bin/shared/` and points the built imports at it, so the
 * published package is self-contained.
 *
 * To opt a package out, remove it from {@link TARGETS} and write its own code.
 *
 * Usage: `node scripts/shared.js <build|inject> <package-dir>`, or
 * `node scripts/shared.js clean` to remove the compiled files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { transformSync } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const sharedDir = join(root, "opx", "shared");

/** Shared source name, mapped to the packages under `opx/` that use it. */
const TARGETS = {
	"eslint-runner": ["lint-js", "lint-json", "lint-md"],
};

/**
 * Write a file unless it already holds this content, so parallel builds don't churn it.
 * @param {string} path - The file to write.
 * @param {string} content - What it should contain.
 */
function write(path, content) {
	if (existsSync(path) && readFileSync(path, "utf8") === content) return;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

/**
 * List the `.js` files under a directory.
 * @param {string} dir - The directory to walk.
 * @returns {Generator<string>} Absolute file paths.
 */
function* jsFiles(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* jsFiles(path);
		else if (path.endsWith(".js")) yield path;
	}
}

const [mode, dir] = process.argv.slice(2);

if (mode === "clean") {
	for (const name of Object.keys(TARGETS)) rmSync(join(sharedDir, `${name}.js`), { force: true });
	process.exit(0);
}

if (!["build", "inject"].includes(mode) || !dir) {
	console.error("usage: node scripts/shared.js <build|inject> <package-dir> | clean");
	process.exit(1);
}

const pkg = basename(resolve(dir));
const bin = join(root, "opx", pkg, "bin");

for (const [name, packages] of Object.entries(TARGETS)) {
	if (!packages.includes(pkg)) continue;

	const shared = join(sharedDir, `${name}.js`);
	const code = transformSync(readFileSync(join(sharedDir, `${name}.ts`), "utf8"), { loader: "ts", format: "esm", target: "node24" }).code;

	if (mode === "build") {
		write(shared, code);
		continue;
	}

	if (!existsSync(bin)) throw new Error(`${pkg} has no bin/ to inject into; build it first.`);
	const copy = join(bin, "shared", `${name}.js`);
	write(copy, code);

	for (const file of jsFiles(bin)) {
		const text = readFileSync(file, "utf8");
		write(file, text.replace(/(["'])(\.{1,2}\/[^"']+)\1/g, (match, quote, specifier) => {
			if (resolve(dirname(file), specifier) !== shared) return match;
			const local = relative(dirname(file), copy).replaceAll("\\", "/");
			return `${quote}${local.startsWith(".") ? local : `./${local}`}${quote}`;
		}));
	}
}
