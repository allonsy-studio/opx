export type {
	CleanupSuggestion,
	Detector,
	DetectorContext,
	DetectorDescription,
	DetectorId,
	HookDeclaration,
	Logger,
	DynamicTask,
	DynamicTaskConfig,
	StaticTask,
	StaticTaskConfig,
	OpxConfig,
	OpxState,
	OpxStateDeferral,
	PackageJson,
	PackageManager,
	SuggestionCommand,
} from "./detector.js";

export type { LoadedPlugin, LoadOptions } from "./registry.js";
export { isValidPluginName, loadPlugins, normalizeDetectorId, resolvePluginPackageName } from "./registry.js";
export {
	CONFIG_KEYS,
	configPath,
	defaultConfig,
	defaultState,
	enabledNames,
	isTaskEnabled,
	readConfig,
	readState,
	statePath,
	writeConfig,
	writeState,
} from "./state.js";
export type { DiffEntry, DiffResult } from "./diff.js";
export { applyDeferral, defaultSkipUntilDate, diff, isDeferred } from "./diff.js";
export type { Environment, InstallOptions, PackageManagerInfo } from "./pkg-manager.js";
export { detectPackageManager, inspectPackageManager, installCommand, uninstallCommand } from "./pkg-manager.js";
export type { ResolvedTool } from "./resolver.js";
export { packageEntry, resolvePackageEntry, resolveTool } from "./resolver.js";
export { filterPathsByExtension } from "./paths.js";
export type { HookInstallResult, HookRemoveResult } from "./hooks.js";
export { POST_COMMIT_LINE, ensureGitignored, ensureOpxIgnored, hookLine, installHook, removeHook } from "./hooks.js";
export type { HookPlan } from "./hook-plan.js";
export { planHooks } from "./hook-plan.js";
export { createConsoleLogger } from "./logger.js";
