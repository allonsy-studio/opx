export type RuntimeMode = "interactive" | "report";

export function detectMode(forceReport: boolean): RuntimeMode {
	if (forceReport) return "report";
	if (process.env.OPX_NONINTERACTIVE) return "report";
	if (process.env.CI) return "report";
	if (!process.stdout.isTTY) return "report";
	return "interactive";
}
