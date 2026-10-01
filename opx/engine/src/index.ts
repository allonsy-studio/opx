export type {
	Detector,
	DetectorContext,
	DetectorDescription,
	DetectorId,
	Logger,
	DynamicTask,
	StaticTask,
	OpxConfig,
	OpxState,
	OpxStateDeferral,
	PackageJson,
	PackageManager,
} from "./detector.js";

export { isValidPluginName, loadPlugins, normalizeDetectorId, resolvePluginPackageName } from "./registry.js";
export {
	configPath,
	defaultConfig,
	defaultState,
	enabledNames,
	readConfig,
	readState,
	statePath,
	writeConfig,
	writeState,
} from "./state.js";
export { applyDeferral, defaultSkipUntilDate, diff, isDeferred } from "./diff.js";
export { detectPackageManager, installCommand } from "./pkg-manager.js";
export { resolveTool } from "./resolver.js";
export { filterPathsByExtension } from "./paths.js";
export { ensureGitignored, ensureOpxIgnored, installPostCommitHook } from "./hooks.js";
export { createConsoleLogger } from "./logger.js";
