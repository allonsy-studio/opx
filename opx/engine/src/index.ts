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
	readConfig,
	readState,
	statePath,
	writeConfig,
	writeState,
} from "./state.js";
export { applyDeferral, defaultSkipUntilDate, diff } from "./diff.js";
export { detectPackageManager, installCommand } from "./pkg-manager.js";
export { resolveTool } from "./resolver.js";
export { filterPathsByExtension } from "./paths.js";
export { ensureGitignored, installPostCommitHook } from "./hooks.js";
export { createConsoleLogger } from "./logger.js";
