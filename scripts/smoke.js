/**
 * Pack every publishable package, install the tarballs into a scratch git
 * repository, and drive the real CLI the way a user would. Catches problems the
 * unit tests can't: missing files in the tarball, unresolved `workspace:`
 * ranges, a broken bin, or a plugin that can't be loaded from node_modules.
 *
 * Run `yarn build` first (the `yarn smoke` script does).
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters as plain } from "node:util";

import * as pty from "@lydell/node-pty";

/** Ignore the machine's git config (signing, hooks, templates) so results do not depend on it. */
const GIT_ISOLATION = { GIT_CONFIG_GLOBAL: resolve(import.meta.dirname, "..", "configs", "empty.gitconfig"), GIT_CONFIG_NOSYSTEM: "1" };

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "opx-smoke-"));
const failures = [];

/**
 * Run a command and capture its output.
 * @param {string} cmd - Executable to run.
 * @param {string[]} args - Arguments.
 * @param {string} cwd - Working directory.
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function run(cmd, args, cwd) {
	const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...GIT_ISOLATION, CI: "1" } });
	return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * Record a pass or fail for one assertion.
 * @param {string} name - What is being checked.
 * @param {boolean} ok - Whether it held.
 * @param {string} [detail] - Extra output shown on failure.
 */
function check(name, ok, detail = "") {
	console.log(`${ok ? "✔" : "✖"} ${name}`);
	if (!ok) {
		failures.push(name);
		if (detail) console.log(detail.trim().split("\n").map((line) => `    ${line}`).join("\n"));
	}
}

/** @returns {string[]} Absolute paths of the publishable workspace packages. */
function publishablePackages() {
	return readdirSync(join(root, "opx"))
		.map((dir) => join(root, "opx", dir))
		.filter((dir) => {
			try {
				return !JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).private;
			} catch {
				return false;
			}
		});
}

/** A TypeScript file that uses the public types of every package. */
const CONSUMER = `import { detectPackageManager, inspectPackageManager, installCommand } from "@allons-y/opx";
import type { CleanupSuggestion, Detector, DetectorContext, PackageManagerInfo } from "@allons-y/opx";
import jsDetector from "@allons-y/opx-lint-js";
import jsonDetector from "@allons-y/opx-lint-json";
import mdDetector from "@allons-y/opx-lint-md";
import tsDetector from "@allons-y/opx-lint-ts";
import releaseDetector from "@allons-y/opx-release";

const detectors: Detector[] = [jsDetector, jsonDetector, mdDetector, tsDetector, releaseDetector];
const info: PackageManagerInfo = inspectPackageManager(".");
const suggestion: CleanupSuggestion = { kind: "file", target: ".eslintrc", reason: "unused" };
export const summary = (ctx: DetectorContext): unknown[] => [
	detectors.map((detector) => detector.cleanup?.(ctx)),
	suggestion,
	detectPackageManager("."),
	installCommand(info.name, ["a"], info),
];
`;

/**
 * Run a command in a real pseudo-terminal and answer its prompts, the way a
 * person at a keyboard would. Each step waits for its pattern in the output,
 * then sends its keys.
 * @param {string} cmd - Executable to run.
 * @param {string[]} args - Arguments.
 * @param {string} cwd - Working directory.
 * @param {Array<[RegExp, string]>} steps - Prompt patterns, in order, each with the keys to answer it.
 * @param {number} [timeout] - Milliseconds before giving up.
 * @returns {Promise<{ code: number, output: string, timedOut: boolean }>}
 */
function drive(cmd, args, cwd, steps, timeout = 90_000) {
	return new Promise((done) => {
		const env = { ...process.env, ...GIT_ISOLATION, NO_COLOR: "1" };
		delete env.CI;
		delete env.OPX_NONINTERACTIVE;
		const term = pty.spawn(cmd, args, { cwd, env, cols: 120, rows: 40 });
		let output = "";
		let next = 0;
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			term.kill();
		}, timeout);
		term.onData((data) => {
			output += data;
			while (next < steps.length && steps[next][0].test(plain(output))) {
				const keys = steps[next][1];
				next += 1;
				setTimeout(() => term.write(keys), 100);
			}
		});
		term.onExit(({ exitCode }) => {
			clearTimeout(timer);
			done({ code: exitCode, output: plain(output), timedOut });
		});
	});
}

try {
	// 1. Pack each package and make sure the manifest is installable.
	const tarballs = [];
	mkdirSync(join(work, "tars"));
	for (const dir of publishablePackages()) {
		const name = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name;
		// Changesets publishes with plain `npm publish`, so pack with npm to see
		// exactly what would reach the registry (`yarn pack` rewrites workspace: ranges).
		const packed = run("npm", ["pack", "--pack-destination", join(work, "tars"), "--silent"], dir);
		check(`pack ${name}`, packed.status === 0, packed.stderr || packed.stdout);
		if (packed.status !== 0) continue;
		const out = join(work, "tars", packed.stdout.trim().split("\n").at(-1));
		tarballs.push(out);

		const manifest = run("tar", ["-xzOf", out, "package/package.json"], work);
		const unresolved = /"workspace:/.test(manifest.stdout);
		check(`${name} has no workspace: ranges`, !unresolved);

		// Lint the tarball's entry points. The packages are ESM-only on purpose, so
		// attw uses its esm-only profile, and it skips subpaths that are config
		// files rather than code (such as ./eslint.config.js).
		const subpaths = Object.keys(JSON.parse(manifest.stdout).exports ?? {}).filter((key) => key !== ".");
		const publint = run(join(root, "node_modules", ".bin", "publint"), [out, "--strict"], work);
		check(`publint ${name}`, publint.status === 0, publint.stdout + publint.stderr);
		const attw = run(join(root, "node_modules", ".bin", "attw"), [out, "--profile", "esm-only", ...(subpaths.length > 0 ? ["--exclude-entrypoints", ...subpaths] : []), "--format", "ascii"], work);
		check(`attw ${name}`, attw.status === 0, attw.stdout + attw.stderr);
	}

	// 2. Install the tarballs into a scratch repository.
	const app = join(work, "app");
	mkdirSync(join(app, "src"), { recursive: true });
	writeFileSync(join(app, "package.json"), `${JSON.stringify({ name: "smoke-app", private: true, type: "module", devDependencies: { eslint: "^9.0.0" } }, null, "\t")}\n`);
	writeFileSync(join(app, "src", "a.js"), "export const a = 1\n");
	writeFileSync(join(app, "README.md"), "# Smoke\n");
	writeFileSync(join(app, ".gitignore"), "node_modules\n.opx/*\n!.opx/config.json\n");
	writeFileSync(join(app, ".eslintrc.json"), "{}\n");
	writeFileSync(join(app, ".eslintignore"), "coverage\n");
	writeFileSync(join(app, ".eslintrc.yml"), "rules:\n  semi: error\n");
	run("git", ["init", "--quiet"], app);

	const installed = run("npm", ["install", "--save-dev", "--no-audit", "--no-fund", ...tarballs], app);
	check("install the packed tarballs", installed.status === 0, installed.stderr);
	if (installed.status !== 0) throw new Error("install failed");

	run("git", ["add", "--all"], app);
	run("git", ["-c", "user.name=smoke", "-c", "user.email=smoke@example.com", "commit", "--quiet", "--message", "init"], app);

	// A pristine copy for the real-terminal check, since the steps below change `app`.
	const interactive = join(work, "app-interactive");
	cpSync(app, interactive, { recursive: true, verbatimSymlinks: true });

	const opx = (...args) => run(join(app, "node_modules", ".bin", "opx"), args, app);

	// 3. Drive the CLI.
	const version = opx("--version");
	check("opx --version prints a version", version.status === 0 && /^\d+\.\d+\.\d+/.test(version.stdout.trim()), version.stderr);

	for (const name of ["lint-js", "lint-json", "lint-md", "lint-ts"]) {
		const types = join(app, "node_modules", "@allons-y", `opx-${name}`, "bin");
		check(`opx-${name} ships declarations, including the shared ones`, existsSync(join(types, "index.d.ts")) && existsSync(join(types, "shared", "eslint-runner.d.ts")));
	}

	for (const name of ["js", "json", "md", "release"]) {
		const enabled = opx("enable", name);
		check(`opx enable ${name}`, enabled.status === 0, enabled.stderr);
	}
	check("opx enable rejects an unknown plugin", opx("enable", "nope").status === 1);

	const config = JSON.parse(readFileSync(join(app, ".opx", "config.json"), "utf8"));
	check("config enables js, json, and md for lint", config.lint?.js === true && config.lint?.json === true && config.lint?.md === true);
	check("config enables release", config.release === true);

	const failing = opx("lint");
	check("opx lint fails on a style error", failing.status === 1 && /semi/.test(failing.stdout), failing.stdout + failing.stderr);

	const fixed = opx("lint", "--fix");
	check("opx lint --fix repairs it", fixed.status === 0, fixed.stdout + fixed.stderr);
	check("opx lint is clean afterwards", opx("lint").status === 0);

	const scan = opx("scan", "--json");
	let scanned;
	try {
		scanned = JSON.parse(scan.stdout);
	} catch {
		scanned = null;
	}
	check("opx scan --json reports nothing left to enable", scanned !== null && scanned.needsPrompt.length === 0, scan.stdout + scan.stderr);
	check("opx scan --strict exits 0", opx("scan", "--strict").status === 0);

	// 4. `opx init` in a real terminal: answer every prompt and check what it wrote.
	const enter = "\r";
	const session = await drive(join(interactive, "node_modules", ".bin", "opx"), ["init", "--cleanup"], interactive, [
		[/Enable js/, enter],
		[/Enable md/, enter],
		[/Enable json/, enter],
		[/Enable release/, enter],
		[/to package\.json scripts/, enter],
		[/Delete the \d+ empty file/, enter],
	]);
	check("opx init finishes in a real terminal", session.code === 0 && !session.timedOut && /Setup complete/.test(session.output), session.output);

	const read = (file) => (existsSync(join(interactive, file)) ? readFileSync(join(interactive, file), "utf8") : "");
	let written = {};
	try {
		written = JSON.parse(read(".opx/config.json"));
	} catch {
		// reported by the check below
	}
	check("opx init enables the plugins that were accepted", written.lint?.js === true && written.lint?.md === true && written.lint?.json === true && written.release === true, read(".opx/config.json"));
	check("opx init adds the lint script and scaffolds eslint.config.js", JSON.parse(read("package.json") || "{}").scripts?.lint === "opx lint" && read("eslint.config.js").includes("opx-lint-js"));
	check("opx init deletes the empty legacy file and keeps the one with content", !existsSync(join(interactive, ".eslintrc.json")) && existsSync(join(interactive, ".eslintignore")));

	// 5. A TypeScript project can read the published declarations on every TypeScript
	// version the packages allow. Declarations are checked in full, with no @types/node.
	const typesCheck = join(app, "types-check");
	mkdirSync(typesCheck);
	writeFileSync(join(typesCheck, "consumer.ts"), CONSUMER);
	writeFileSync(
		join(typesCheck, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { module: "nodenext", moduleResolution: "nodenext", target: "es2022", strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ["consumer.ts"] }),
	);
	for (const major of ["5", "6"]) {
		const prefix = join(work, `typescript-${major}`);
		mkdirSync(prefix);
		const got = run("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund", `typescript@${major}`], work);
		check(`install TypeScript ${major}`, got.status === 0, got.stderr);
		if (got.status !== 0) continue;
		const tsc = run(process.execPath, [join(prefix, "node_modules", "typescript", "bin", "tsc"), "-p", join(typesCheck, "tsconfig.json")], typesCheck);
		check(`a TypeScript ${major} project compiles against the published types`, tsc.status === 0, tsc.stdout + tsc.stderr);
	}

	// The packed plugins' suggestions reach the CLI: an empty legacy file is offered for deletion, the rest is advice
	// with a command, and the version named is the one the plugin ships, not the project's older eslint.
	const init = opx("init", "--cleanup");
	check(
		"opx init shows the plugins' cleanup suggestions",
		/Empty files that git can restore:\n\s+- \.eslintrc\.json/.test(init.stdout) && init.stdout.includes(".eslintignore: opx lint uses its own config"),
		init.stdout + init.stderr,
	);
	check("opx init prints the migrate command for a legacy config", init.stdout.includes("Run: npx @eslint/migrate-config .eslintrc.yml"), init.stdout);
	check(
		"opx init names the eslint version the plugin ships",
		/eslint: bundled by @allons-y\/opx-lint-\w+ at (?!9\.)\d+\.\d+\.\d+/.test(init.stdout),
		init.stdout,
	);
} catch (error) {
	if (error.message !== "install failed") failures.push(String(error));
} finally {
	rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error(`\n${failures.length} smoke check(s) failed.`);
	process.exit(1);
}
console.log("\nAll smoke checks passed.");
