import base from "@allons-y/opx-format/prettier";

/** @type {import('prettier').Config} */
export default {
	...base,
	overrides: [
		...(base.overrides ?? []),
		{
			files: ".github/**/*.yml",
			options: {
				useTabs: false,
			},
		},
	],
};
