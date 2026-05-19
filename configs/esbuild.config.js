import { build } from "esbuild";

await build({
	entryPoints: ["src/index.ts"],
	outfile: "bin/index.js",
	bundle: true,
	platform: "node",
	target: "node24",
	format: "esm",
	packages: "external",
});
