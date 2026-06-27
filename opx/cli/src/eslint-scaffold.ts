import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * opx lint detectors that ship a composable flat `eslint.config.js`. Each maps
 * its short name to the package that exports the config.
 */
const ESLINT_CONFIG_PACKAGES: Record<string, string> = {
	js: "@allons-y/opx-lint-js",
	json: "@allons-y/opx-lint-json",
	md: "@allons-y/opx-lint-md",
};

/**
 * Build the contents of a root `eslint.config.js` that composes the given opx
 * lint detectors' shipped flat configs by spreading them into one array.
 *
 * Returns null when none of the short names map to a config-shipping package.
 * The generated file is owned by the consumer — they can append their own or
 * third-party config objects after the spreads.
 */
export function composeEslintConfig(shortNames: string[]): string | null {
	const entries = shortNames
		.filter((name) => name in ESLINT_CONFIG_PACKAGES)
		.map((name) => ({ binding: name, pkg: ESLINT_CONFIG_PACKAGES[name] }));
	if (entries.length === 0) return null;

	const imports = entries.map((e) => `import ${e.binding} from "${e.pkg}/eslint.config.js";`).join("\n");
	const spreads = entries.map((e) => `\t...${e.binding},`).join("\n");

	return `${imports}

/**
 * ESLint flat config composed from your enabled opx lint detectors.
 *
 * This file is yours to edit. Flat config is just an array, so you can append
 * your own config objects or third-party plugins after the spreads below and
 * they merge with opx's configs (last match wins, per ESLint's flat-config
 * cascade). Keep each block scoped with \`files\` so rules don't leak across
 * languages.
 */
export default [
${spreads}
];
`;
}

/**
 * Write a composable root `eslint.config.js` for the given lint short names,
 * but only for detectors actually installed in the host and only when the host
 * doesn't already have an `eslint.config.js` (we never clobber a user file).
 *
 * Returns the path written, or null if nothing was written.
 */
export function scaffoldEslintConfig(cwd: string, shortNames: string[]): string | null {
	const target = join(cwd, "eslint.config.js");
	if (existsSync(target)) return null;

	const installed = shortNames.filter((name) => {
		const pkg = ESLINT_CONFIG_PACKAGES[name];
		return pkg ? existsSync(join(cwd, "node_modules", ...pkg.split("/"))) : false;
	});

	const contents = composeEslintConfig(installed);
	if (!contents) return null;

	writeFileSync(target, contents, "utf8");
	return target;
}
