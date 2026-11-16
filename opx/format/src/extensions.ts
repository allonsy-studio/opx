/** The file extensions each lint plugin owns, by short name, so format covers what opx lints. */
export const EXTENSIONS_BY_PLUGIN: Readonly<Record<string, readonly string[]>> = {
	js: [".js", ".mjs", ".cjs", ".jsx"],
	ts: [".ts", ".tsx", ".mts", ".cts"],
	json: [".json", ".jsonc", ".json5"],
	md: [".md", ".mdx"],
};

/** Every file extension opx lints, which is what `format` covers when no lint plugin narrows it. */
export const FORMAT_EXTENSIONS: ReadonlySet<string> = new Set(Object.values(EXTENSIONS_BY_PLUGIN).flat());
