import js from "@allons-y/opx-lint-js/eslint.config.js";
import ts from "typescript-eslint";

const tsFiles = ["**/*.{ts,tsx,mts,cts}"];
const format = js.find((config) => config.plugins?.["@stylistic"]);

/**
 * Root JS and TS lint config. TypeScript rules live here until `@allons-y/opx-lint-ts` ships.
 */
export default [
	...js,
	...ts.configs.recommended.map((config) => ({ ...config, files: tsFiles })),
	{ ...format, files: tsFiles },
];
