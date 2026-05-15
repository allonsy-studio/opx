/** @type {import('prettier').Config} */
export default {
	printWidth: 800,
	tabWidth: 4,
	useTabs: true,
	overrides: [
		{
			files: ".github/**/*.yml",
			options: {
				useTabs: false,
			},
		},
	],
};
