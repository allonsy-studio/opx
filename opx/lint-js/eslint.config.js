import { defineConfig } from "eslint/config";
import globals from "globals";

import js from "@eslint/js";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-js.
 * Owns code-quality rules for JavaScript files; layout belongs to
 * @allons-y/opx-format (Prettier). Plugins resolve from this package's own
 * node_modules.
 */
export default defineConfig([
	{
		ignores: ["**/node_modules/**", "**/.yarn/**", "**/.pnp.*", "**/.opx/**", "**/bin/**", "**/dist/**"],
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
		// Modern syntax: keeps ES5 idioms out of ESM code. Most auto-fix; prefer-rest-params
		// and some prefer-spread cases need a manual edit. no-console stays opt-in.
		files: ["**/*.{js,mjs,cjs}"],
		rules: {
			"no-var": "error",
			"prefer-const": "error",
			"prefer-arrow-callback": "error",
			"prefer-template": "error",
			"prefer-spread": "error",
			"prefer-rest-params": "error",
			"prefer-object-spread": "error",
			"object-shorthand": "error",
			"no-unused-vars": ["error", { ignoreRestSiblings: true }],
		},
	},
]);
