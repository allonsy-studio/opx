// @ts-check
/** @type {import('@commitlint/types').UserConfig} */
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"header-max-length": [0],
		"body-max-line-length": [0, "always", Infinity],
	},
};
