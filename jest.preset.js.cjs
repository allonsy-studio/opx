const isCI = !!process.env.CI;

/** JS-only preset (no ts-jest/typescript required). @type {import('jest').Config} */
module.exports = {
	clearMocks: true,
	moduleFileExtensions: ["js", "mjs", "cjs"],
	testEnvironment: "node",
	testMatch: ["**/*.test.js", "**/*.test.mjs"],
	verbose: true,
	collectCoverageFrom: ["src/**/*.js", "*.js", "!**/*.test.js", "!**/node_modules/**", "!**/vendor/**", "!**/coverage/**"],
	coverageDirectory: "./coverage",
	coverageReporters: isCI ? ["cobertura", "json"] : ["text", "text-summary"],
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: -10,
		},
	},
};
