import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectPackageManager, installCommand } from "./pkg-manager.js";

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "opx-pm-"));
}

describe("detectPackageManager", () => {
	it("prefers lockfiles: yarn > pnpm > npm", () => {
		const dir = tmp();
		writeFileSync(join(dir, "yarn.lock"), "");
		writeFileSync(join(dir, "pnpm-lock.yaml"), "");
		expect(detectPackageManager(dir)).toBe("yarn");
		rmSync(dir, { recursive: true });
	});

	it("detects pnpm and npm lockfiles", () => {
		const pnpm = tmp();
		writeFileSync(join(pnpm, "pnpm-lock.yaml"), "");
		expect(detectPackageManager(pnpm)).toBe("pnpm");
		rmSync(pnpm, { recursive: true });

		const npm = tmp();
		writeFileSync(join(npm, "package-lock.json"), "{}");
		expect(detectPackageManager(npm)).toBe("npm");
		rmSync(npm, { recursive: true });
	});

	it("falls back to the packageManager field, then npm", () => {
		const dir = tmp();
		expect(detectPackageManager(dir, { packageManager: "yarn@4.1.0" })).toBe("yarn");
		expect(detectPackageManager(dir, { packageManager: "pnpm@9" })).toBe("pnpm");
		expect(detectPackageManager(dir, { packageManager: "npm@10" })).toBe("npm");
		expect(detectPackageManager(dir, {})).toBe("npm");
		expect(detectPackageManager(dir)).toBe("npm");
		rmSync(dir, { recursive: true });
	});
});

describe("installCommand", () => {
	it("builds dev install commands per package manager", () => {
		expect(installCommand("yarn", ["a", "b"])).toBe("yarn add -D a b");
		expect(installCommand("pnpm", ["a"])).toBe("pnpm add -D a");
		expect(installCommand("npm", ["a"])).toBe("npm install --save-dev a");
	});

	it("supports non-dev installs and empty package lists", () => {
		expect(installCommand("yarn", ["a"], { dev: false })).toBe("yarn add a");
		expect(installCommand("npm", ["a"], { dev: false })).toBe("npm install a");
		expect(installCommand("yarn", [])).toBe("");
	});
});
