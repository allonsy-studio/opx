import { defineConfig } from "eslint/config";

import ts from "typescript-eslint";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-ts.
 * Owns code-quality rules (typescript-eslint) for TypeScript files; layout
 * belongs to @allons-y/opx-format (Prettier). Plugins resolve from this
 * package's own node_modules.
 */
export default defineConfig([
	{
		ignores: ["**/node_modules/**", "**/.yarn/**", "**/.pnp.*", "**/.opx/**", "**/bin/**", "**/dist/**"],
	},
	{
		files: ["**/*.{ts,tsx,mts,cts}"],
		plugins: { ts },
		extends: ["ts/recommended"],
	},
]);
