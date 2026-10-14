import { defineConfig } from "eslint/config";
import globals from "globals";

import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-js.
 * Owns both semantic lint and formatting (via @stylistic) for JavaScript
 * files. Plugins resolve from this package's own node_modules.
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
		// Scope formatting rules to JS so this config composes cleanly: when
		// spread alongside opx-lint-json / opx-lint-md (or third-party configs),
		// these rules must not leak onto .json/.md files.
		files: ["**/*.{js,mjs,cjs,jsx}"],
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
