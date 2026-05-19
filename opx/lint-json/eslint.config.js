import { defineConfig } from "eslint/config";

import json from "@eslint/json";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-json.
 * Lints .json by default. JSONC and JSON5 support activate only when the user
 * opts in via `opx init` (stored as overrides.json.dialects in opx.config.json);
 * the runner then includes the matching glob patterns in lintFiles.
 */
export default defineConfig([
	{
		ignores: ["**/node_modules/**", "**/.yarn/**", "**/.opx/**", "**/bin/**", "**/dist/**", "**/coverage/**"],
	},
	{
		files: ["**/*.json"],
		plugins: { json },
		language: "json/json",
		extends: ["json/recommended"],
	},
	{
		files: ["**/*.jsonc"],
		plugins: { json },
		language: "json/jsonc",
		extends: ["json/recommended"],
	},
	{
		files: ["**/*.json5"],
		plugins: { json },
		language: "json/json5",
		extends: ["json/recommended"],
	},
]);
