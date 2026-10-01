import { HtmlBasePlugin, InputPathToUrlTransformPlugin } from "@11ty/eleventy";
import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";

const pathPrefix = process.env.DOCS_BASE_URL || "/";

/** @param {import("@11ty/eleventy").UserConfig} config */
export default function (config) {
	config.addPlugin(eleventyNavigationPlugin);
	config.addPlugin(syntaxHighlight);
	// Rewrite relative links to .md sources (including TypeDoc output) into page URLs.
	config.addPlugin(InputPathToUrlTransformPlugin);
	// Prefix root-relative URLs with pathPrefix (needed for GitHub Pages project sites).
	config.addPlugin(HtmlBasePlugin);

	config.setLibrary(
		"md",
		markdownIt({ html: true, linkify: true }).use(markdownItAnchor, {
			permalink: markdownItAnchor.permalink.headerLink(),
		}),
	);

	config.addPassthroughCopy({ "src/assets": "assets" });

	return {
		pathPrefix,
		dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
		markdownTemplateEngine: false,
		htmlTemplateEngine: "njk",
		templateFormats: ["md", "njk", "html"],
	};
}
