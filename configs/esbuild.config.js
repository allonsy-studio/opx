import { globSync } from "node:fs";

import { build } from "esbuild";

// Build every source module except test files, which must never ship in `bin/`.
const entryPoints = globSync("src/**/*.ts").filter((file) => !file.endsWith(".test.ts"));

await build({
	entryPoints,
	bundle: false,
	outdir: "bin",
	platform: "node",
	target: "node24",
	format: "esm",
	packages: "external",
});
