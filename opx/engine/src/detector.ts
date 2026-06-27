export type DetectorId = string;

export type PackageManager = "npm" | "yarn" | "pnpm";

export type Logger = {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
};

export type PackageJson = {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	[k: string]: unknown;
};

export type DynamicTask = "lint" | "build";

export type DynamicTaskConfig<PluginName extends string = string, PluginConfig = Record<string, unknown>> = {
	[key in DynamicTask]?: {
		[key in PluginName]: PluginConfig | boolean;
	}
};

export type StaticTask = "release" | "test";

export type StaticTaskConfig = {
	[key in StaticTask]?: boolean;
};

export type OpxConfig<PluginName extends string = string, PluginConfig = Record<string, unknown>> = {
	$schema?: string;
	version: 1;
} & DynamicTaskConfig<PluginName, PluginConfig> & StaticTaskConfig;

export type OpxStateDeferral = {
	branch: string;
	skipUntilDate: string;
	reason: "later" | string;
};

export type OpxState = {
	version: 1;
	lastScanCommit?: string;
	deferrals: Record<string, OpxStateDeferral>;
};

export type DetectorContext = {
	cwd: string;
	fileTypes: Set<string>;
	hostPkg: PackageJson;
	pkgManager: PackageManager;
	config: OpxConfig;
	state: OpxState;
	branch: string;
	logger: Logger;
	dryRun: boolean;
	fix: boolean;
	/**
	 * Sink for a detector's primary (report) output — e.g. an ESLint results
	 * report. Defaults to stdout, but the CLI may swap in a buffer so concurrent
	 * detectors' output can be flushed grouped instead of interleaved. Use this
	 * instead of writing to `process.stdout` directly.
	 */
	write(chunk: string): void;
};

export type DetectorDescription = {
	summary: string;
	bundledDeps: string[];
};

export type Detector = {
	id: DetectorId;
	shortName: string;
	displayName: string;
	concern: "lint" | "test" | "build" | "release";
	fileTypes?: string[];
	detect(ctx: DetectorContext): boolean | Promise<boolean>;
	describe(ctx: DetectorContext): DetectorDescription;
	run?(ctx: DetectorContext, args: string[]): Promise<number>;
};
