import { fileURLToPath } from "node:url";

// Set here, not in a setup file: Jest gives tests a copy of process.env, so only
// the config's own environment reaches the git processes the tests spawn.

/** Tests must not depend on which package manager launched them. */
delete process.env.npm_config_user_agent;

/** Tests run git in scratch repos, so ignore the machine's git config (signing, hooks, templates). */
process.env.GIT_CONFIG_GLOBAL = fileURLToPath(new URL("./empty.gitconfig", import.meta.url));
process.env.GIT_CONFIG_NOSYSTEM = "1";

/** Git hooks export these, which would point scratch repos at the real one. */
for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) delete process.env[name];

const isCI = !!process.env.CI;

/** @type {import('jest').Config} */
export default {
	clearMocks: true,
	moduleFileExtensions: ["ts", "js"],
	testEnvironment: "node",
	testMatch: ["**/*.test.ts"],
	// The sources are NodeNext ESM (import.meta, dynamic import). Run the tests
	// as ESM so they execute the code the way Node does in production.
	extensionsToTreatAsEsm: [".ts"],
	transform: {
		"^.+\\.ts$": ["ts-jest", { useESM: true }],
	},
	moduleNameMapper: {
		// Resolve the workspace engine to its source so cross-package tests load
		// it through ts-jest rather than the built output.
		"^@allons-y/opx$": "<rootDir>/../engine/src/index.ts",
		// Resolve the `shared` alias to its TypeScript source, not the compiled file beside it.
		"^shared/(.*)\\.js$": "<rootDir>/../shared/src/$1.ts",
		// Strip the `.js` extension NodeNext requires on relative specifiers.
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	verbose: true,
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.test.ts",
		// Helpers for tests, not shipped code.
		"!src/testing.ts",
		// Entry points are thin re-exports / commander bootstrap — exercised via
		// integration, not unit coverage.
		"!src/index.ts",
		"!**/node_modules/**",
		"!**/vendor/**",
	],
	// Type declarations only: no runtime code to cover.
	coveragePathIgnorePatterns: ["/node_modules/", "/engine/src/detector\\.ts$"],
	coverageDirectory: "./coverage",
	coverageProvider: "v8",
	coverageReporters: isCI ? ["cobertura", "json"] : ["text", "text-summary"],
	// Each package runs Jest on its own, so these apply per package. They sit a
	// couple of points under what the packages reach today (98-100% lines,
	// 96-100% branches, 96-100% functions), so real erosion fails and routine
	// changes do not. Raise them when the floor rises.
	coverageThreshold: {
		global: {
			branches: 94,
			functions: 94,
			lines: 98,
			statements: 98,
		},
	},
};
