import { createConfig } from "../configs/semantic-release.config.js";

export default createConfig({
	gitAssets: [
		"CHANGELOG.md",
		"README.md",
		"LICENSE",
		"package.json",
	],
});
