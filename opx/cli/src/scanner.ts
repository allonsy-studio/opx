import { execFileSync } from "node:child_process";
import { extname, basename } from "node:path";

/**
 * @todo use a more robust scanner that can handle symlinks and other edge cases.
 *
 * Map of well-known filenames to a synthetic "type" token, so detectors can
 * match Dockerfiles, Makefiles, `.yarnrc.yml`, etc. by name.
 */
const NAMED_TYPES: Record<string, string> = {
	Dockerfile: "dockerfile",
	"dockerfile": "dockerfile",
	Makefile: "makefile",
	"makefile": "makefile",
	LICENSE: "license",
	".gitignore": "gitignore",
	".gitattributes": "gitattributes",
	".npmrc": "npmrc",
	".nvmrc": "nvmrc",
	".yarnrc.yml": "yarnrc",
};

/** Declaration files, which describe types rather than holding source. */
const DECLARATION_FILE = /\.d\.[mc]?ts$/i;

/**
 * The file type tokens for a file name: a known name's token, such as
 * `dockerfile` or `yarnrc`, and the lowercase extension. Declaration files
 * get `.d.ts` instead of `.ts`, so a JavaScript package that ships
 * hand-written types is not mistaken for a TypeScript project.
 *
 * @param name - A file's base name.
 * @returns The tokens, possibly none.
 */
export function fileTypesOf(name: string): string[] {
	const types: string[] = [];
	const named = NAMED_TYPES[name];
	if (named) types.push(named);
	if (DECLARATION_FILE.test(name)) types.push(".d.ts");
	else {
		const ext = extname(name);
		if (ext) types.push(ext.toLowerCase());
	}
	return types;
}

export type ScanResult = {
	fileTypes: Set<string>;
	fileCount: number;
};

/**
 * Scan the committed tree of a git repository and return the unique set of
 * file types present. Uses `git ls-tree -r -z --name-only HEAD` which reads
 * directly from the object database (no working tree stat).
 */
export function scanCommittedTree(cwd: string): ScanResult {
	let stdout: Buffer;
	try {
		stdout = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", "HEAD"], {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch {
		return { fileTypes: new Set(), fileCount: 0 };
	}

	const fileTypes = new Set<string>();
	const text = stdout.toString("utf8");
	if (text.length === 0) return { fileTypes, fileCount: 0 };

	const files = text.split("\0").filter((p) => p.length > 0);
	for (const file of files) {
		for (const type of fileTypesOf(basename(file))) fileTypes.add(type);
	}

	return { fileTypes, fileCount: files.length };
}

/**
 * Return the file paths newly added or modified in the latest commit.
 * Used by the post-commit hook to detect "new" file types since the last scan.
 */
export function listFilesInHeadCommit(cwd: string): string[] {
	try {
		const stdout = execFileSync(
			"git",
			["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"],
			{ cwd, stdio: ["ignore", "pipe", "ignore"] },
		);
		return stdout.toString("utf8").split("\0").filter((p) => p.length > 0);
	} catch {
		return [];
	}
}

export function getCurrentBranch(cwd: string): string {
	try {
		const stdout = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
		});
		return stdout.toString("utf8").trim() || "HEAD";
	} catch {
		return "HEAD";
	}
}

export function getHeadCommit(cwd: string): string | undefined {
	try {
		const stdout = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
		});
		return stdout.toString("utf8").trim() || undefined;
	} catch {
		return undefined;
	}
}
