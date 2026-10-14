export type {
	Detector,
	DetectorContext,
	DetectorDescription,
	DetectorId,
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
} from "./detector.js";

export type { LoadedPlugin, LoadOptions } from "./registry.js";
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
export type { DiffEntry, DiffResult } from "./diff.js";
export { applyDeferral, defaultSkipUntilDate, diff, isDeferred } from "./diff.js";
export { detectPackageManager, installCommand } from "./pkg-manager.js";
export type { ResolvedTool } from "./resolver.js";
export { resolveTool } from "./resolver.js";
export { filterPathsByExtension } from "./paths.js";
export type { HookInstallResult } from "./hooks.js";
export { ensureGitignored, ensureOpxIgnored, installPostCommitHook } from "./hooks.js";
export { createConsoleLogger } from "./logger.js";
export type { EslintRunSpec } from "./eslint-runner.js";
export { runEslint } from "./eslint-runner.js";
