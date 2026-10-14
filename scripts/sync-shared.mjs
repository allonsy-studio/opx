/**
 * Inject shared source into the packages that opt in.
 *
 * `shared/<name>.ts` (and `shared/<name>.test.ts`, when present) are copied to
 * `opx/<package>/src/shared/` so each published package carries its own copy and
 * needs no runtime dependency. The copies are generated and git-ignored; edit
 * the file in `shared/`.
 *
 * To opt a package out, remove it from {@link TARGETS} and write its own code.
 *
 * Usage: `node scripts/sync-shared.mjs [package-dir]`. Without an argument,
 * every target package is synced.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

/** Shared source name, mapped to the packages under `opx/` that receive a copy. */
const TARGETS = {
	"eslint-runner": ["lint-js", "lint-json", "lint-md"],
};

/**
 * Copy one shared file into a package, skipping the write when it is unchanged.
 * @param {string} name - The shared file name without its extension.
 * @param {string} suffix - `.ts` or `.test.ts`.
 * @param {string} pkg - The package directory name under `opx/`.
 */
function inject(name, suffix, pkg) {
	const source = join(root, "shared", `${name}${suffix}`);
	if (!existsSync(source)) return;

	const dir = join(root, "opx", pkg, "src", "shared");
	const target = join(dir, `${name}${suffix}`);
	const next = `/** @generated from shared/${name}${suffix} by scripts/sync-shared.mjs. Do not edit. */\n${readFileSync(source, "utf8")}`;
	if (existsSync(target) && readFileSync(target, "utf8") === next) return;

	mkdirSync(dir, { recursive: true });
	writeFileSync(target, next);
}

const only = process.argv[2] ? basename(resolve(process.argv[2])) : null;

for (const [name, packages] of Object.entries(TARGETS)) {
	for (const pkg of packages) {
		if (only && pkg !== only) continue;
		for (const suffix of [".ts", ".test.ts"]) inject(name, suffix, pkg);
	}
}

// Drop copies in packages that have since opted out.
for (const pkg of only ? [only] : []) {
	const stale = join(root, "opx", pkg, "src", "shared");
	const optedIn = Object.values(TARGETS).some((packages) => packages.includes(pkg));
	if (!optedIn && existsSync(stale)) rmSync(stale, { recursive: true });
}
