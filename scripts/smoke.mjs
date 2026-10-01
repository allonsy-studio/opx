/**
 * Pack every publishable package, install the tarballs into a scratch git
 * repository, and drive the real CLI the way a user would. Catches problems the
 * unit tests can't: missing files in the tarball, unresolved `workspace:`
 * ranges, a broken bin, or a plugin that can't be loaded from node_modules.
 *
 * Run `yarn build` first (the `yarn smoke` script does).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
	const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, CI: "1" } });
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
	}

	// 2. Install the tarballs into a scratch repository.
	const app = join(work, "app");
	mkdirSync(join(app, "src"), { recursive: true });
	writeFileSync(join(app, "package.json"), `${JSON.stringify({ name: "smoke-app", private: true, type: "module" }, null, "\t")}\n`);
	writeFileSync(join(app, "src", "a.js"), "export const a = 1\n");
	writeFileSync(join(app, "README.md"), "# Smoke\n");
	writeFileSync(join(app, ".gitignore"), "node_modules\n.opx/*\n!.opx/config.json\n");
	run("git", ["init", "--quiet"], app);

	const installed = run("npm", ["install", "--save-dev", "--no-audit", "--no-fund", ...tarballs], app);
	check("install the packed tarballs", installed.status === 0, installed.stderr);
	if (installed.status !== 0) throw new Error("install failed");

	run("git", ["add", "--all"], app);
	run("git", ["-c", "user.name=smoke", "-c", "user.email=smoke@example.com", "commit", "--quiet", "--message", "init"], app);

	const opx = (...args) => run(join(app, "node_modules", ".bin", "opx"), args, app);

	// 3. Drive the CLI.
	const version = opx("--version");
	check("opx --version prints a version", version.status === 0 && /^\d+\.\d+\.\d+/.test(version.stdout.trim()), version.stderr);

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
