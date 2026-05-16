import { execFileSync } from "node:child_process";
import { extname, basename } from "node:path";

/**
 * Map of well-known extensionless filenames to a synthetic "type" token.
 * Lets detectors match Dockerfiles, Makefiles, etc. without inventing fake
 * extensions.
 */
const EXTENSIONLESS_TYPES: Record<string, string> = {
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
		const name = basename(file);
		const ext = extname(name);
		if (ext) {
			fileTypes.add(ext.toLowerCase());
			continue;
		}
		const known = EXTENSIONLESS_TYPES[name];
		if (known) fileTypes.add(known);
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
			["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"],
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
