import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DetectorContext, OpxConfig, OpxState, PackageJson } from "@allons-y/opx";
import { createConsoleLogger, detectPackageManager, readConfig, readState } from "@allons-y/opx";

import { getCurrentBranch, scanCommittedTree } from "./scanner.js";

export type BuildContextOptions = {
	cwd: string;
	debug?: boolean;
	dryRun?: boolean;
	fix?: boolean;
};

export function readHostPackage(cwd: string): PackageJson {
	const path = join(cwd, "package.json");
	if (!existsSync(path)) return {};
	return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

export function buildContext(options: BuildContextOptions): DetectorContext {
	const { cwd, debug = false, dryRun = false, fix = false } = options;
	const hostPkg = readHostPackage(cwd);
	const config: OpxConfig = readConfig(cwd);
	const state: OpxState = readState(cwd);
	const scan = scanCommittedTree(cwd);

	return {
		cwd,
		fileTypes: scan.fileTypes,
		hostPkg,
		pkgManager: detectPackageManager(cwd, hostPkg),
		config,
		state,
		branch: getCurrentBranch(cwd),
		logger: createConsoleLogger({ debug }),
		dryRun,
		fix,
	};
}
