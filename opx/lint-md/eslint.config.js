import { defineConfig } from "eslint/config";

import markdown from "@eslint/markdown";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-md.
 * Lints Markdown (.md) and MDX (.mdx) using @eslint/markdown.
 */
export default defineConfig([
	{
		ignores: ["**/node_modules/**", "**/.yarn/**", "**/.opx/**", "**/bin/**", "**/dist/**", "**/coverage/**"],
	},
	{
		files: ["**/*.md"],
		plugins: { markdown },
		language: "markdown/commonmark",
		extends: ["markdown/recommended"],
	},
	{
		files: ["**/*.mdx"],
		plugins: { markdown },
		language: "markdown/gfm",
		extends: ["markdown/recommended"],
	},
]);
