import { defineConfig } from "eslint/config";

import markdown from "@eslint/markdown";

/**
 * Opinionated default ESLint flat config shipped by @allons-y/opx-lint-md.
 * Lints Markdown (.md) and MDX (.mdx) using @eslint/markdown.
 */
export default defineConfig([
	{
		ignores: [
			"**/node_modules/**",
			"**/.yarn/**",
			"**/.opx/**",
			"**/bin/**",
			"**/dist/**",
			"**/coverage/**",
			// GitHub markdown templates use task-list / placeholder syntax that
			// trips Markdown rules (e.g. no-missing-label-refs); don't lint them.
			"**/.github/PULL_REQUEST_TEMPLATE.md",
			"**/.github/PULL_REQUEST_TEMPLATE/**",
			"**/.github/ISSUE_TEMPLATE/**",
		],
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
