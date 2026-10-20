import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectPackageManager, inspectPackageManager, installCommand, uninstallCommand } from "./pkg-manager.js";

const dirs: string[] = [];

/** A scratch directory holding the given empty files. */
function tmp(...files: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "opx-pm-"));
	dirs.push(dir);
	for (const file of files) writeFileSync(join(dir, file), "");
	return dir;
}

const agent = (text: string): Record<string, string> => ({ npm_config_user_agent: text });

afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("detectPackageManager", () => {
	it("detects each manager from its lockfile", () => {
		expect(detectPackageManager(tmp("yarn.lock"), {}, {})).toBe("yarn");
		expect(detectPackageManager(tmp("pnpm-lock.yaml"), {}, {})).toBe("pnpm");
		expect(detectPackageManager(tmp("package-lock.json"), {}, {})).toBe("npm");
		expect(detectPackageManager(tmp("npm-shrinkwrap.json"), {}, {})).toBe("npm");
		expect(detectPackageManager(tmp("bun.lock"), {}, {})).toBe("bun");
		expect(detectPackageManager(tmp("bun.lockb"), {}, {})).toBe("bun");
	});

	it("falls back to the packageManager field, then npm", () => {
		const dir = tmp();
		expect(detectPackageManager(dir, { packageManager: "yarn@4.1.0" }, {})).toBe("yarn");
		expect(detectPackageManager(dir, { packageManager: "pnpm@9" }, {})).toBe("pnpm");
		expect(detectPackageManager(dir, { packageManager: "npm@10" }, {})).toBe("npm");
		expect(detectPackageManager(dir, { packageManager: "bun@1.2.0" }, {})).toBe("bun");
		expect(detectPackageManager(dir, {}, {})).toBe("npm");
		expect(detectPackageManager(dir, undefined, {})).toBe("npm");
	});

	it("ignores a packageManager field it does not recognise", () => {
		expect(detectPackageManager(tmp(), { packageManager: "deno@2" }, {})).toBe("npm");
		expect(detectPackageManager(tmp(), { packageManager: 4 }, {})).toBe("npm");
	});
});

describe("inspectPackageManager", () => {
	describe("order of signals", () => {
		it("trusts the packageManager field over a lockfile, and says so when they differ", () => {
			const info = inspectPackageManager(tmp("package-lock.json"), { packageManager: "pnpm@9.0.0" }, {});
			expect(info).toMatchObject({ name: "pnpm", certain: false });
			expect(info.reason).toBe("packageManager says pnpm, but there is also a npm lockfile");
		});

		it("is sure when the field and the lockfile agree, or the field stands alone", () => {
			expect(inspectPackageManager(tmp("pnpm-lock.yaml"), { packageManager: "pnpm@9.0.0" }, {})).toMatchObject({ name: "pnpm", certain: true });
			expect(inspectPackageManager(tmp(), { packageManager: "yarn@4.1.0" }, {})).toMatchObject({ name: "yarn", certain: true, reason: "packageManager field" });
		});

		it("is sure of a single lockfile", () => {
			expect(inspectPackageManager(tmp("bun.lockb"), {}, {})).toMatchObject({ name: "bun", certain: true, reason: "bun lockfile" });
		});

		it("treats a bun.lock and a bun.lockb as one manager", () => {
			expect(inspectPackageManager(tmp("bun.lock", "bun.lockb"), {}, {})).toMatchObject({ name: "bun", certain: true });
		});

		it("is unsure when lockfiles disagree, preferring the launcher then a fixed order", () => {
			const dir = tmp("yarn.lock", "package-lock.json", "pnpm-lock.yaml");
			expect(inspectPackageManager(dir, {}, {})).toMatchObject({ name: "yarn", certain: false, reason: "lockfiles for yarn and pnpm and npm" });
			expect(inspectPackageManager(dir, {}, agent("pnpm/9.0.0 npm/? node/v24.0.0"))).toMatchObject({ name: "pnpm", certain: false });
			expect(inspectPackageManager(dir, {}, agent("bun/1.2.0"))).toMatchObject({ name: "yarn", certain: false });
		});

		it("lets a lockfile beat the launcher, since npx reports npm in any project", () => {
			expect(inspectPackageManager(tmp("yarn.lock"), {}, agent("npm/10.0.0 node/v24.0.0"))).toMatchObject({ name: "yarn", certain: true });
		});

		it("uses the launcher when the project says nothing", () => {
			expect(inspectPackageManager(tmp(), {}, agent("bun/1.2.0 npm/? node/v24.0.0"))).toMatchObject({ name: "bun", certain: true, reason: "run through bun" });
			expect(inspectPackageManager(tmp(), {}, agent("pnpm/9.0.0"))).toMatchObject({ name: "pnpm", certain: true });
		});

		it("falls back to npm without signals or with a launcher it does not know", () => {
			expect(inspectPackageManager(tmp(), {}, {})).toMatchObject({ name: "npm", certain: true, reason: "default" });
			expect(inspectPackageManager(tmp(), {}, agent("deno/2.0.0"))).toMatchObject({ name: "npm" });
		});
	});

	describe("finding the project's lockfile", () => {
		it("looks up from a workspace member to the repository root", () => {
			const root = tmp("pnpm-lock.yaml");
			mkdirSync(join(root, ".git"));
			mkdirSync(join(root, "packages", "app"), { recursive: true });
			expect(inspectPackageManager(join(root, "packages", "app"), {}, {})).toMatchObject({ name: "pnpm", certain: true });
		});

		it("reads a parent's packageManager field", () => {
			const root = tmp();
			mkdirSync(join(root, ".git"));
			writeFileSync(join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.2.0" }));
			mkdirSync(join(root, "app"));
			expect(inspectPackageManager(join(root, "app"), {}, {})).toMatchObject({ name: "bun", certain: true });
		});

		it("does not look above the repository root", () => {
			const outer = tmp("yarn.lock");
			mkdirSync(join(outer, "repo", ".git"), { recursive: true });
			mkdirSync(join(outer, "repo", "app"));
			expect(inspectPackageManager(join(outer, "repo", "app"), {}, {})).toMatchObject({ name: "npm", reason: "default" });
		});
	});

	describe("workspace root", () => {
		it("is a workspace root with a pnpm-workspace.yaml or a workspaces field", () => {
			expect(inspectPackageManager(tmp("pnpm-lock.yaml", "pnpm-workspace.yaml"), {}, {}).workspaceRoot).toBe(true);
			expect(inspectPackageManager(tmp("yarn.lock"), { workspaces: ["packages/*"] }, {}).workspaceRoot).toBe(true);
			expect(inspectPackageManager(tmp("yarn.lock"), {}, {}).workspaceRoot).toBe(false);
		});

		it("is not a workspace root just because a parent is", () => {
			const root = tmp("pnpm-lock.yaml", "pnpm-workspace.yaml");
			mkdirSync(join(root, ".git"));
			mkdirSync(join(root, "app"));
			expect(inspectPackageManager(join(root, "app"), {}, {}).workspaceRoot).toBe(false);
		});
	});

	describe("Yarn Classic", () => {
		it("is Yarn Classic without a Yarn 2+ marker", () => {
			expect(inspectPackageManager(tmp("yarn.lock"), {}, {}).yarnClassic).toBe(true);
			expect(inspectPackageManager(tmp(), { packageManager: "yarn@1.22.19" }, {}).yarnClassic).toBe(true);
		});

		it("is not Yarn Classic with a .yarnrc.yml or a Yarn 2+ packageManager field", () => {
			expect(inspectPackageManager(tmp("yarn.lock", ".yarnrc.yml"), {}, {}).yarnClassic).toBe(false);
			expect(inspectPackageManager(tmp(), { packageManager: "yarn@4.1.0" }, {}).yarnClassic).toBe(false);
		});

		it("is only ever true for yarn", () => {
			expect(inspectPackageManager(tmp("pnpm-lock.yaml"), {}, {}).yarnClassic).toBe(false);
			expect(inspectPackageManager(tmp("bun.lock"), {}, {}).yarnClassic).toBe(false);
		});
	});
});

describe("installCommand", () => {
	it("builds dev install commands per package manager", () => {
		expect(installCommand("yarn", ["a", "b"])).toBe("yarn add -D a b");
		expect(installCommand("pnpm", ["a"])).toBe("pnpm add -D a");
		expect(installCommand("npm", ["a"])).toBe("npm install --save-dev a");
		expect(installCommand("bun", ["a"])).toBe("bun add -d a");
	});

	it("supports non-dev installs and empty package lists", () => {
		expect(installCommand("yarn", ["a"], { dev: false })).toBe("yarn add a");
		expect(installCommand("npm", ["a"], { dev: false })).toBe("npm install a");
		expect(installCommand("bun", ["a"], { dev: false })).toBe("bun add a");
		expect(installCommand("yarn", [])).toBe("");
	});

	it("adds the workspace-root flag only where the manager needs it", () => {
		expect(installCommand("pnpm", ["a"], { workspaceRoot: true })).toBe("pnpm add -D -w a");
		expect(installCommand("yarn", ["a"], { workspaceRoot: true, yarnClassic: true })).toBe("yarn add -D -W a");
		expect(installCommand("yarn", ["a"], { workspaceRoot: true, yarnClassic: false })).toBe("yarn add -D a");
		expect(installCommand("npm", ["a"], { workspaceRoot: true })).toBe("npm install --save-dev a");
		expect(installCommand("bun", ["a"], { workspaceRoot: true })).toBe("bun add -d a");
		expect(installCommand("yarn", ["a"], { yarnClassic: true })).toBe("yarn add -D a");
	});
});

describe("uninstallCommand", () => {
	it("builds remove commands per package manager", () => {
		expect(uninstallCommand("yarn", ["a", "b"])).toBe("yarn remove a b");
		expect(uninstallCommand("pnpm", ["a"])).toBe("pnpm remove a");
		expect(uninstallCommand("npm", ["a"])).toBe("npm uninstall a");
		expect(uninstallCommand("bun", ["a"])).toBe("bun remove a");
	});

	it("returns an empty string for no packages", () => {
		expect(uninstallCommand("yarn", [])).toBe("");
	});
});
