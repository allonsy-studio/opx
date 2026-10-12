/** A detector's package id, such as `@allons-y/opx-lint-js`. */
export type DetectorId = string;

/** The package managers opx can detect and install with. */
export type PackageManager = "npm" | "yarn" | "pnpm";

/** Leveled logging that detectors write through instead of using `console` directly. */
export type Logger = {
	/** Report normal progress. */
	info(msg: string): void;
	/** Report something that needs attention but is not fatal. */
	warn(msg: string): void;
	/** Report a failure. */
	error(msg: string): void;
	/** Report detail that is shown only when debugging is on. */
	debug(msg: string): void;
};

/** The parts of a `package.json` that opx reads. Other fields pass through untyped. */
export type PackageJson = {
	/** The package name. */
	name?: string;
	/** The package version. */
	version?: string;
	/** Runtime dependencies, by name and version range. */
	dependencies?: Record<string, string>;
	/** Development dependencies, by name and version range. */
	devDependencies?: Record<string, string>;
	/** Peer dependencies, by name and version range. */
	peerDependencies?: Record<string, string>;
	/** Package scripts, by name. */
	scripts?: Record<string, string>;
	[k: string]: unknown;
};

/** A task whose plugins are chosen per project, so config lists them by short name. */
export type DynamicTask = "lint" | "build";

/**
 * The config keys for dynamic tasks: each maps a plugin short name to `true`,
 * `false`, or that plugin's settings.
 */
export type DynamicTaskConfig<PluginName extends string = string, PluginConfig = Record<string, unknown>> = {
	[key in DynamicTask]?: {
		[key in PluginName]: PluginConfig | boolean;
	}
};

/** A task with no plugin choice, so config turns it on or off with a boolean. */
export type StaticTask = "release" | "test";

/** The config keys for static tasks, each a boolean. */
export type StaticTaskConfig = {
	[key in StaticTask]?: boolean;
};

/**
 * The contents of `.opx/config.json`.
 *
 * @typeParam PluginName - The plugin short names allowed as keys.
 * @typeParam PluginConfig - The settings object a plugin accepts.
 */
export type OpxConfig<PluginName extends string = string, PluginConfig = Record<string, unknown>> = {
	/** URL of the JSON schema that editors use to validate the file. */
	$schema?: string;
	/** The config format version. */
	version: 1;
} & DynamicTaskConfig<PluginName, PluginConfig> & StaticTaskConfig;

/** A "later" answer to a plugin suggestion, remembered for one branch. */
export type OpxStateDeferral = {
	/** The branch the deferral applies to. */
	branch: string;
	/** The last day, as `YYYY-MM-DD`, that the suggestion stays hidden. */
	skipUntilDate: string;
	/** Why the suggestion was deferred. */
	reason: "later" | string;
};

/** The contents of `.opx/state.json`, a local cache that opx can rebuild. */
export type OpxState = {
	/** The state format version. */
	version: 1;
	/** The last commit the post-commit hook scanned. */
	lastScanCommit?: string;
	/** Deferred suggestions, by plugin short name. */
	deferrals: Record<string, OpxStateDeferral>;
};

/** What a detector is given: the project, its settings, and how to report. */
export type DetectorContext = {
	/** The repository root. */
	cwd: string;
	/** File extensions found in the committed tree, with the leading dot. */
	fileTypes: Set<string>;
	/** The host project's `package.json`. */
	hostPkg: PackageJson;
	/** The host project's package manager. */
	pkgManager: PackageManager;
	/** The parsed `.opx/config.json`. */
	config: OpxConfig;
	/** The parsed `.opx/state.json`. */
	state: OpxState;
	/** The current git branch. */
	branch: string;
	/** Where to send log messages. */
	logger: Logger;
	/** Whether to report what would change without changing it. */
	dryRun: boolean;
	/** Whether the tool should fix problems it can fix. */
	fix: boolean;
	/**
	 * Sink for a detector's primary (report) output — e.g. an ESLint results
	 * report. Defaults to stdout, but the CLI may swap in a buffer so concurrent
	 * detectors' output can be flushed grouped instead of interleaved. Use this
	 * instead of writing to `process.stdout` directly.
	 */
	write(chunk: string): void;
};

/** A human-readable description of what a detector does. */
export type DetectorDescription = {
	/** One sentence on what the detector covers. */
	summary: string;
	/** Tools the detector package ships, such as `eslint`. */
	bundledDeps: string[];
};

/** The contract every opx plugin implements: decide when it applies, then run. */
export type Detector = {
	/** The package id, such as `@allons-y/opx-lint-js`. */
	id: DetectorId;
	/** The short name used in config and commands, such as `js`. */
	shortName: string;
	/** The name shown to people. */
	displayName: string;
	/** The task this detector belongs to. */
	concern: "lint" | "test" | "build" | "release";
	/** File extensions this detector owns, with the leading dot. */
	fileTypes?: string[];
	/** Whether the detector applies to this project. */
	detect(ctx: DetectorContext): boolean | Promise<boolean>;
	/** Describe the detector for display. */
	describe(ctx: DetectorContext): DetectorDescription;
	/**
	 * Run the tool.
	 *
	 * @param ctx - The detector context.
	 * @param args - Paths and flags forwarded from the command line.
	 * @returns The exit code: `0` for success.
	 */
	run?(ctx: DetectorContext, args: string[]): Promise<number>;
};
