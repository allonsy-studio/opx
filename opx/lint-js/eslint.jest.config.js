import { defineConfig } from "eslint/config";

import jest from "eslint-plugin-jest";

export default defineConfig([
	{
		ignores: ["coverage/**"],
	},
	{
		files: ["**/*.test.js", "**/*.test.ts"],
		plugins: { jest },
		extends: ["jest/recommended"],
		languageOptions: {
			globals: jest.environments.globals.globals,
		},
	},
	{
		files: ["**/*.test.ts", "__mocks__/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
]);
