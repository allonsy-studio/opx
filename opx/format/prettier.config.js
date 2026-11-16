/**
 * The default Prettier config shipped by @allons-y/opx-format: tabs, double
 * quotes, semicolons, trailing commas, and a 120-column wrap. JSON uses two
 * spaces. Spread it into your own `prettier.config.js` to extend it.
 *
 * @type {import("prettier").Config}
 */
export default {
	printWidth: 120,
	tabWidth: 4,
	useTabs: true,
	singleQuote: false,
	semi: true,
	trailingComma: "all",
	overrides: [
		{
			files: "*.json",
			options: {
				tabWidth: 2,
				useTabs: false,
			},
		},
	],
};
