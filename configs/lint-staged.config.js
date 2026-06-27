/**
 * lint-staged runs the opx toolkit itself against staged files. opx lint
 * forwards the matched paths to each enabled detector's runner (ESLint for
 * js/ts/json, etc.), so there is no separate eslint/prettier wiring to keep in
 * sync — the bundled flat config shipped by @allons-y/opx-lint-* is the single
 * source of truth.
 *
 * Discovered via `lint-staged --config configs/lint-staged.config.js` (see
 * .husky/pre-commit); lint-staged appends the staged file paths to the command.
 */
export default {
	"*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,json,jsonc,json5,md,mdx}": "opx lint --fix",
};
