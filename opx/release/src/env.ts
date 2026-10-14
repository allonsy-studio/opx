/**
 * Load a local `.env` for `GITHUB_TOKEN`. It never overrides variables already set.
 *
 * @param path - The env file to read; defaults to `.env` in the working directory.
 */
export function loadLocalEnv(path?: string): void {
	try {
		process.loadEnvFile(path);
	} catch {
		// No .env, or an unreadable one: fall back to the existing environment.
	}
}
