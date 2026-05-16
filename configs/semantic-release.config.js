/**
 * Shared semantic-release pipeline for @allons-y developer projects.
 *
 * Consumer notes:
 * - `gitAssets` defaults to `CHANGELOG.md`, `README.md`, and `package.json`.
 *   Override per project if your build emits something else (e.g. `dist/index.js`).
 * - The exec plugin force-pushes a major tag (v1, v2, …) so workflows can pin to
 *   the major. Requires GH_TOKEN with `contents: write`.
 * - If your project is a GitHub Action, use `@allons-y/toolkit/semantic-release` instead.
 */

const defaultGitAssets = ["CHANGELOG.md", "README.md", "package.json"];

/**
 * @param {{ gitAssets?: string[] }} [options]
 * @returns {import('semantic-release').GlobalConfig}
 */
export function createConfig(options = {}) {
	const gitAssets = options.gitAssets ?? defaultGitAssets;

	return {
		plugins: [
			[
				"@semantic-release/commit-analyzer",
				{
					preset: "conventionalcommits",
					releaseRules: [
						{ type: "feat", release: "minor" },
						{ type: "fix", release: "patch" },
						{ type: "perf", release: "patch" },
						{ type: "revert", release: "patch" },
						{ breaking: true, release: "major" },
					],
				},
			],
			[
				"@semantic-release/release-notes-generator",
				{
					preset: "conventionalcommits",
					presetConfig: {
						types: [
							{ type: "feat", section: "✨ Features", hidden: false },
							{ type: "fix", section: "🐛 Bug Fixes", hidden: false },
							{ type: "perf", section: "⚡ Performance Improvements", hidden: false },
							{ type: "revert", section: "⏪ Reverts", hidden: false },
							{ type: "docs", section: "📚 Documentation", hidden: false },
							{ type: "refactor", section: "♻️ Refactoring", hidden: false },
							{ type: "test", section: "✅ Tests", hidden: true },
							{ type: "build", section: "📦 Build System", hidden: true },
							{ type: "ci", section: "👷 CI", hidden: true },
							{ type: "chore", section: "🔧 Maintenance", hidden: true },
						],
					},
					writerOpts: {
						commitPartial: `
*{{#if scope}} **{{scope}}:**{{~/if}}
{{~#if subject}}{{subject}}{{else}}{{header}}{{/if}}
{{~#if hash}}{{#if @root.linkReferences}} ([{{shortHash}}]({{@root.host}}/{{@root.owner}}/{{@root.repository}}/commit/{{hash}}))){{else}} {{shortHash}}{{/if}}{{/if}}
{{~#if references}}, closes{{#each references}} {{#if @root.linkReferences}}[#{{this.issue}}]({{@root.host}}/{{@root.owner}}/{{@root.repository}}/issues/{{this.id}}){{else}}#{{this.issue}}{{/if}}{{#unless @last}}, {{/unless}}{{/each}}{{/if}}`,
					},
				},
			],
			[
				"@semantic-release/changelog",
				{
					changelogFile: "CHANGELOG.md",
					changelogTitle: "# Changelog\n\nAll notable changes to this project will be documented in this file. See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.",
				},
			],
			[
				"@semantic-release/github",
				{
					assets: [{ path: "CHANGELOG.md", label: "Changelog" }],
				},
			],
			[
				"@semantic-release/git",
				{
					assets: gitAssets,
					message: "chore(release): <%= nextRelease.version %> [skip ci]\n\n<%= new Date().toLocaleDateString('en-GB', {year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }) %>\n<%= nextRelease.notes %>",
				},
			],
			[
				"@semantic-release/exec",
				{
					successCmd: 'MAJOR=$(echo "${nextRelease.gitTag}" | cut -d. -f1) && git tag -f "$MAJOR" "${nextRelease.gitTag}" && git remote set-url origin "https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY.git" && git push --force origin "refs/tags/$MAJOR"',
				},
			],
		],
	};
}

export default createConfig();
