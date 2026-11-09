/**
 * Share source between packages without a runtime dependency.
 *
 * While developing, packages import `shared/<name>.js`, the root package's
 * alias for the `opx/shared` workspace. `build` compiles each shared file
 * beside its source so built packages resolve it in the repo. `inject`, run by a package's `prepack`, copies the compiled file
 * into the package's `bin/shared/`, points the built imports at it, and emits
 * the type declarations, so the published package is self-contained.
 *
 * To opt a package out, remove it from {@link TARGETS} and write its own code.
 *
 * Usage: `node scripts/shared.js <build|inject> <package-dir>`, or
 * `node scripts/shared.js clean` to remove the compiled files.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { transformSync } from "esbuild";

/** Shared source name, mapped to the packages under `opx/` that use it. */
export const TARGETS = {
	"eslint-runner": ["lint-js", "lint-json", "lint-md", "lint-ts"],
	"eslint-cleanup": ["lint-js", "lint-json", "lint-md", "lint-ts"],
};

/**
 * @typedef {object} Options
 * @property {string} root - The repository root.
 * @property {Record<string, string[]>} [targets] - Shared names mapped to the packages that use them.
 * @property {(sharedDir: string, bin: string) => void} [declarations] - Emits the shared type declarations into `bin/shared`.
 */

/**
 * Write a file unless it already holds this content, so parallel builds don't churn it.
 * @param {string} path - The file to write.
 * @param {string} content - What it should contain.
 * @returns {boolean} Whether the file changed.
 */
export function write(path, content) {
	if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	return true;
}

/**
 * Emit the shared workspace's type declarations into a package's `bin/shared` with `tsc`.
 *
 * The package's own declarations come from its normal build; `tsc` skips the
 * shared source there because it resolves through `node_modules`.
 * @param {string} sharedDir - The shared workspace's `src` directory.
 * @param {string} bin - The package's `bin` directory.
 */
function emitDeclarations(sharedDir, bin) {
	const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
	execFileSync(process.execPath, [tsc, "-p", join(sharedDir, "..", "tsconfig.json"), "--emitDeclarationOnly", "--outDir", join(bin, "shared")], { stdio: "inherit" });
}

/**
 * List the `.js` and `.d.ts` files under a directory.
 * @param {string} dir - The directory to walk.
 * @returns {Generator<string>} Absolute file paths.
 */
export function* sourceFiles(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* sourceFiles(path);
		else if (path.endsWith(".js") || path.endsWith(".d.ts")) yield path;
	}
}

/**
 * The import specifier that reaches `target` from `file`: relative, with forward slashes.
 * @param {string} file - The importing file.
 * @param {string} target - The imported file.
 */
export function relativeSpecifier(file, target) {
	const path = relative(dirname(file), target).replaceAll("\\", "/");
	return path.startsWith(".") ? path : `./${path}`;
}

/**
 * Point a file's `shared/<name>.js` imports at the copy beside it. Only quoted
 * specifiers change, so a mention in a comment or a longer name stays as written.
 * @param {string} text - The file's contents.
 * @param {string} alias - The specifier to replace, such as `shared/eslint-runner.js`.
 * @param {string} specifier - The relative specifier to use instead.
 */
export function rewriteImports(text, alias, specifier) {
	return text.replaceAll(`"${alias}"`, `"${specifier}"`).replaceAll(`'${alias}'`, `'${specifier}'`);
}

/**
 * Remove the compiled shared files `build` writes beside their source.
 * @param {Options} options
 */
export function clean({ root, targets = TARGETS }) {
	const sharedDir = join(root, "opx", "shared", "src");
	for (const name of Object.keys(targets)) rmSync(join(sharedDir, `${name}.js`), { force: true });
}

/**
 * Compile each shared file a package uses: beside its source for `build`, or into the
 * package's `bin/shared` with its imports rewritten for `inject`.
 * @param {"build" | "inject"} mode
 * @param {string} dir - The package directory; only its name is used.
 * @param {Options} options
 * @returns {string[]} The files written.
 * @throws When `inject` runs before the package is built.
 */
export function share(mode, dir, { root, targets = TARGETS, declarations = emitDeclarations }) {
	const sharedDir = join(root, "opx", "shared", "src");
	const pkg = basename(resolve(dir));
	const bin = join(root, "opx", pkg, "bin");
	const names = Object.entries(targets)
		.filter(([, packages]) => packages.includes(pkg))
		.map(([name]) => name);
	const written = [];

	if (mode === "inject" && names.length > 0) {
		if (!existsSync(bin)) throw new Error(`${pkg} has no bin/ to inject into; build it first.`);
		declarations(sharedDir, bin);
	}

	for (const name of names) {
		const code = transformSync(readFileSync(join(sharedDir, `${name}.ts`), "utf8"), { loader: "ts", format: "esm", target: "node24" }).code;

		if (mode === "build") {
			const compiled = join(sharedDir, `${name}.js`);
			if (write(compiled, code)) written.push(compiled);
			continue;
		}

		const copy = join(bin, "shared", `${name}.js`);
		if (write(copy, code)) written.push(copy);
		for (const file of sourceFiles(bin)) {
			if (write(file, rewriteImports(readFileSync(file, "utf8"), `shared/${name}.js`, relativeSpecifier(file, copy)))) written.push(file);
		}
	}
	return written;
}

/**
 * Run from the command line.
 * @param {string[]} args - `[mode, dir]`.
 * @param {Options} options
 * @returns {number} The exit code.
 */
export function main([mode, dir], options) {
	if (mode === "clean") {
		clean(options);
		return 0;
	}
	if ((mode !== "build" && mode !== "inject") || !dir) {
		console.error("usage: node scripts/shared.js <build|inject> <package-dir> | clean");
		return 1;
	}
	share(mode, dir, options);
	return 0;
}

/* node:coverage ignore next 3 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	process.exitCode = main(process.argv.slice(2), { root: resolve(import.meta.dirname, "..") });
}
