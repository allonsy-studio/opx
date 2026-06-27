import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveTool } from "./resolver.js";

const bundledRequire = createRequire(import.meta.url);

describe("resolveTool", () => {
	it("resolves from the host project when available", () => {
		// The monorepo root has typescript installed, so a host-rooted require finds it.
		const result = resolveTool("typescript", process.cwd(), bundledRequire);
		expect(result.source).toBe("host");
		expect(result.packagePath).toContain("typescript");
	});

	it("falls back to the bundled require when the host lacks the tool", () => {
		const emptyHost = mkdtempSync(join(tmpdir(), "opx-resolve-"));
		const result = resolveTool("jest", emptyHost, bundledRequire);
		expect(result.source).toBe("bundled");
		expect(result.packagePath).toContain("jest");
		rmSync(emptyHost, { recursive: true });
	});
});
