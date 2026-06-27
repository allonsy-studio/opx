import { defineConfig } from "eslint/config";
import globals from "globals";

import js from "@eslint/js";
import ts from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-js.
 * Owns both semantic lint and formatting (via @stylistic) for JavaScript and
 * TypeScript files. Plugins resolve from this package's own node_modules.
 */
export default defineConfig([
	{
		ignores: ["**/node_modules/**", "**/.yarn/**", "**/.opx/**", "**/bin/**", "**/dist/**"],
	},
	{
		files: ["**/*.{js,mjs,cjs}"],
		plugins: { js },
		extends: ["js/recommended"],
		languageOptions: {
			sourceType: "module",
			globals: globals.node,
		},
	},
	{
		files: ["**/*.{ts,tsx,mts,cts}"],
		plugins: { ts },
		extends: ["ts/recommended"],
	},
	{
		// Scope formatting rules to JS/TS so this config composes cleanly: when
		// spread alongside opx-lint-json / opx-lint-md (or third-party configs),
		// these rules must not leak onto .json/.md files.
		files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"],
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
