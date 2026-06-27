import { extname } from "node:path";

/**
 * Filter CLI path arguments to those a detector should handle, given the file
 * extensions it owns.
 *
 * - Explicit file paths whose extension isn't owned are dropped, so a detector
 *   doesn't lint (and warn about) another language's files when the CLI forwards
 *   the same path list to every detector.
 * - Directories, extensionless args, and globs — including brace globs like
 *   `**​/*.{js,ts}` whose extension is ambiguous — are kept, letting the
 *   underlying tool expand and match them itself.
 *
 * Extensions are compared case-insensitively and must include the leading dot
 * (e.g. `".ts"`).
 */
export function filterPathsByExtension(
	paths: string[],
	extensions: ReadonlySet<string>,
): string[] {
	return paths.filter((path) => {
		const ext = extname(path).toLowerCase();
		if (ext === "" || extensions.has(ext)) return true;
		// Ambiguous extension produced by a glob (e.g. ".{js,ts}") — keep it and
		// let the tool decide what matches.
		return /[*?{}[\]]/.test(ext);
	});
}
