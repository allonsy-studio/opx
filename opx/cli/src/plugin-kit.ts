import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { intersects, satisfies, valid, validRange } from "semver";
import type { DetectorContext, PackageJson, PackageManager } from "@allons-y/opx";

import { buildContext } from "./context.js";

/**
 * Shared authoring surface for the opx CLI and its plugins.
 *
 * This module is a dependency-light leaf: it pulls in nothing that runs the CLI,
 * so command modules and tests can import it without triggering the program
 * entrypoint. Keep it that way — it is the one place both first-party commands
 * and third-party plugin authors look for the conventions below.
 */

/** The CLI's invoked name. Used in help text and user-facing messages. */
export const CLI_NAME = "opx" as const;

/**
 * The contract every opx command (and detector runner) follows: do the work and
 * **return an exit code** — never call `process.exit` yourself.
 *
 * Returning the code instead of exiting is what makes a handler unit-testable:
 * a test can call it directly, assert on the number, and inspect any logged
 * output, with no process teardown. The CLI runtime owns the single
 * `process.exit` at the edge (see {@link toAction}).
 *
 * `0` means success; any non-zero value is forwarded as the process exit code.
 * When several handlers/detectors run together, the convention is to surface the
 * first non-zero code (see `runDetectorsGrouped` and the `release` command).
 *
 * @param ctx - The detector context for the host repo (cwd, config, logger, …).
 * @param args - Positional arguments forwarded from the command line.
 * @returns The exit code the process should report.
 */
export type CommandHandler = (ctx: DetectorContext, args: string[]) => Promise<number>;

/**
 * Adapt a {@link CommandHandler} into a commander `.action()` callback.
 *
 * This is the *only* place the CLI builds a context from the current working
 * directory and calls `process.exit`. Authoring a command then comes down to
 * writing a pure `(ctx, args) => Promise<number>` and wiring it up here:
 *
 * ```ts
 * program.command("build").action(toAction(runBuildCommand));
 * ```
 *
 * @param handler - The command's pure, testable handler.
 * @returns A commander action callback that builds the context, runs the
 *   handler, and exits with its code.
 */
export function toAction(handler: CommandHandler): (args?: string[]) => Promise<void> {
	return async (args?: string[]) => {
		const ctx = buildContext({ cwd: process.cwd() });
		process.exit(await handler(ctx, args ?? []));
	};
}

/**
 * The npm dist-tag a prerelease publishes under, such as `beta` for `1.0.0-beta.3`.
 *
 * @param version - A semver version.
 * @returns The tag, or `undefined` for a stable version.
 */
export function prereleaseTag(version: string | undefined): string | undefined {
	return version?.match(/-([a-z]+)(?:\.|$)/i)?.[1]?.toLowerCase();
}

/** Pin packages to a dist-tag, since npm can't resolve a bare name that only has prereleases. */
export function withTag(packages: string[], tag: string | undefined): string[] {
	// A spec that already names a version or range, such as `pkg@^1.0.0`, keeps it.
	return tag ? packages.map((pkg) => (pkg.lastIndexOf("@") > 0 ? pkg : `${pkg}@${tag}`)) : packages;
}

/** Package managers that install a package's peer dependencies themselves, by default. */
const INSTALLS_PEERS: ReadonlySet<PackageManager> = new Set(["npm", "pnpm", "bun"]);

/**
 * Whether a package manager installs peer dependencies without being asked.
 *
 * @param pm - The package manager.
 * @returns `false` for Yarn, which only warns about a missing peer.
 */
export function installsPeers(pm: PackageManager): boolean {
	return INSTALLS_PEERS.has(pm);
}

/** Quote an install spec for a command line when it holds spaces or shell characters, as `^5 || ^6` does. */
export function quoteSpec(spec: string): string {
	return /[\s|<>&]/.test(spec) ? `"${spec}"` : spec;
}

/** Split a command into arguments, keeping a double-quoted spec together. */
export function splitCommand(cmd: string): string[] {
	return (cmd.match(/"[^"]*"|\S+/g) ?? []).map((part) => part.replace(/^"|"$/g, ""));
}

/** Find an installed package's manifest the way Node resolves it, looking in each parent `node_modules`. */
function readInstalled(cwd: string, pkg: string): PackageJson & { peerDependenciesMeta?: Record<string, { optional?: boolean }> } | undefined {
	for (let dir = resolve(cwd); ; dir = dirname(dir)) {
		const file = join(dir, "node_modules", ...pkg.split("/"), "package.json");
		if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
		if (dirname(dir) === dir) return undefined;
	}
}

/** A peer the project already has that a plugin doesn't support. opx only reports it. */
export type PeerConflict = {
	/** The plugin that declares the peer. */
	plugin: string;
	/** The peer's package name. */
	peer: string;
	/** The version installed, or the project's declared range when nothing is installed to read. */
	found: string;
	/** The range the plugin supports. */
	range: string;
};

/** Whether what the project has fits a plugin's range; unparseable ranges, such as tags, count as fitting. */
function fits(cwd: string, peer: string, declared: string, range: string): boolean {
	const installed = readInstalled(cwd, peer)?.version;
	if (installed && valid(installed)) return satisfies(installed, range, { includePrerelease: true });
	return !validRange(declared) || !validRange(range) || intersects(declared, range, { includePrerelease: true });
}

/**
 * The peer dependencies of installed plugins that the host doesn't list yet,
 * and the ones it lists that a plugin doesn't support.
 *
 * The plugin's `peerDependencies` are the one place its supported ranges live,
 * so the package manager resolves the newest version each range allows. A peer
 * the project already has is never changed, only reported.
 *
 * @param cwd - The repository root.
 * @param plugins - Installed plugin package names.
 * @param hostPkg - The host's `package.json`.
 * @returns Install specs, the project's peers a plugin doesn't support, and the plugins whose manifest couldn't be found, such as under Plug'n'Play.
 */
export function missingPeers(cwd: string, plugins: string[], hostPkg: PackageJson): { specs: string[]; conflicts: PeerConflict[]; unreadable: string[] } {
	const have = { ...hostPkg.dependencies, ...hostPkg.devDependencies };
	const specs: string[] = [];
	const conflicts: PeerConflict[] = [];
	const unreadable: string[] = [];
	for (const plugin of plugins) {
		const manifest = readInstalled(cwd, plugin);
		if (!manifest) {
			unreadable.push(plugin);
			continue;
		}
		for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
			if (manifest.peerDependenciesMeta?.[name]?.optional) continue;
			const declared = have[name];
			if (declared === undefined) {
				const spec = `${name}@${range}`;
				if (!specs.includes(spec)) specs.push(spec);
			} else if (!fits(cwd, name, declared, range)) {
				conflicts.push({ plugin, peer: name, found: readInstalled(cwd, name)?.version ?? declared, range });
			}
		}
	}
	return { specs, conflicts, unreadable };
}
