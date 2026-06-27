const isCI = !!process.env.CI;

/** @type {import('jest').Config} */
export default {
	clearMocks: true,
	moduleFileExtensions: ["js", "ts"],
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
		// Strip the `.js` extension NodeNext requires on relative specifiers.
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	verbose: true,
	collectCoverageFrom: [
		"src/*.ts",
		"!src/*.test.ts",
		// Entry points are thin re-exports / commander bootstrap — exercised via
		// integration, not unit coverage.
		"!src/index.ts",
		"!**/node_modules/**",
		"!**/vendor/**",
	],
	coverageDirectory: "./coverage",
	coverageProvider: "v8",
	coverageReporters: isCI ? ["cobertura", "json"] : ["text", "text-summary"],
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: 80,
		},
	},
};
