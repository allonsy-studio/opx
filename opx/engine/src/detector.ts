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

export type OpxConfigOverride = Record<string, string>;

export type OpxConfig = {
	$schema?: string;
	version: 1;
	lint: string[];
	test?: string[];
	build?: string[];
	overrides?: Record<string, OpxConfigOverride>;
};

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
};

export type DetectorDescription = {
	summary: string;
	bundledDeps: string[];
};

export type Detector = {
	id: DetectorId;
	shortName: string;
	displayName: string;
	fileTypes: string[];
	detect(ctx: DetectorContext): boolean | Promise<boolean>;
	describe(ctx: DetectorContext): DetectorDescription;
	run?(ctx: DetectorContext, args: string[]): Promise<number>;
};
