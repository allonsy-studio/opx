/**
 * Share source between packages without a runtime dependency.
 *
 * While developing, packages import `opx/shared/<name>.ts` directly. `build`
 * compiles each shared file beside its source so built packages resolve it in
 * the repo. `inject`, run by a package's `prepack`, copies the compiled file
 * into the package's `bin/shared/`, points the built imports at it, and emits
 * the type declarations, so the published package is self-contained.
 *
 * To opt a package out, remove it from {@link TARGETS} and write its own code.
 *
 * Usage: `node scripts/shared.js <build|inject> <package-dir>`, or
 * `node scripts/shared.js clean` to remove the compiled files.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

import { transformSync } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const sharedDir = join(root, "opx", "shared", "src");

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
 * Emit a package's type declarations into its `bin`, with the shared ones in `bin/shared`.
 *
 * `tsc` mirrors each file's path relative to the package's `rootDir` (`opx/`),
 * so the declarations go to a scratch directory first and are then moved.
 * @param {string} pkg - The package directory name under `opx/`.
 * @param {string} bin - The package's `bin` directory.
 */
function emitDeclarations(pkg, bin) {
	const scratch = mkdtempSync(join(tmpdir(), "opx-dts-"));
	try {
		const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
		execFileSync(process.execPath, [tsc, "-p", "tsconfig.json", "--emitDeclarationOnly", "--outDir", scratch], { cwd: join(root, "opx", pkg), stdio: "inherit" });
		cpSync(join(scratch, pkg, "src"), bin, { recursive: true });
		cpSync(join(scratch, "shared", "src"), join(bin, "shared"), { recursive: true });
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/**
 * List the `.js` and `.d.ts` files under a directory.
 * @param {string} dir - The directory to walk.
 * @returns {Generator<string>} Absolute file paths.
 */
function* sourceFiles(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* sourceFiles(path);
		else if (path.endsWith(".js") || path.endsWith(".d.ts")) yield path;
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

if (mode === "inject" && Object.values(TARGETS).some((packages) => packages.includes(pkg))) {
	if (!existsSync(bin)) throw new Error(`${pkg} has no bin/ to inject into; build it first.`);
	emitDeclarations(pkg, bin);
}

for (const [name, packages] of Object.entries(TARGETS)) {
	if (!packages.includes(pkg)) continue;

	const shared = join(sharedDir, `${name}.js`);
	const code = transformSync(readFileSync(join(sharedDir, `${name}.ts`), "utf8"), { loader: "ts", format: "esm", target: "node24" }).code;

	if (mode === "build") {
		write(shared, code);
		continue;
	}

	const copy = join(bin, "shared", `${name}.js`);
	write(copy, code);

	for (const file of sourceFiles(bin)) {
		const text = readFileSync(file, "utf8");
		write(file, text.replace(/(["'])(\.{1,2}\/[^"']+)\1/g, (match, quote, specifier) => {
			if (resolve(dirname(file), specifier) !== shared) return match;
			const local = relative(dirname(file), copy).replaceAll("\\", "/");
			return `${quote}${local.startsWith(".") ? local : `./${local}`}${quote}`;
		}));
	}
}
