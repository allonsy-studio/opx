import { defineConfig } from "eslint/config";

import stylistic from "@stylistic/eslint-plugin";
import ts from "typescript-eslint";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-ts.
 * Owns both semantic lint (typescript-eslint) and formatting (via @stylistic)
 * for TypeScript files. Plugins resolve from this package's own node_modules.
 */
export default defineConfig([
	{
		ignores: ["**/node_modules/**", "**/.yarn/**", "**/.opx/**", "**/bin/**", "**/dist/**"],
	},
	{
		files: ["**/*.{ts,tsx,mts,cts}"],
		plugins: { ts },
		extends: ["ts/recommended"],
	},
	{
		// Scope formatting rules to TS so this config composes cleanly with the
		// other opx lint configs: these rules must not leak onto other languages.
		files: ["**/*.{ts,tsx,mts,cts}"],
		plugins: { "@stylistic": stylistic },
		rules: {
			"@stylistic/indent": ["error", "tab"],
			"@stylistic/quotes": ["error", "double", { avoidEscape: true }],
			"@stylistic/semi": ["error", "always"],
			"@stylistic/comma-dangle": ["error", "always-multiline"],
			"@stylistic/eol-last": ["error", "always"],
			"@stylistic/no-trailing-spaces": "error",
		},
	},
]);
