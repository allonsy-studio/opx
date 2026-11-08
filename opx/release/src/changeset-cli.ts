import { spawn } from "node:child_process";
import { createRequire } from "node:module";

/** Resolve the bundled `@changesets/cli` executable (exported as `./bin.js`). */
function resolveChangesetBin(): string {
	const require = createRequire(import.meta.url);
	return require.resolve("@changesets/cli/bin.js");
}

/**
 * Run the bundled changesets CLI with the given args, inheriting stdio.
 * @returns The CLI's exit code, or `1` when it can't start.
 */
export function runChangeset(cwd: string, args: string[]): Promise<number> {
	const bin = resolveChangesetBin();
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: "inherit" });
		child.on("close", (code) => resolve(code ?? 0));
		child.on("error", (err) => {
			console.error(`opx: failed to run changesets: ${err.message}`);
			resolve(1);
		});
	});
}
