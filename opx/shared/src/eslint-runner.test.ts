import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { DetectorContext } from "@allons-y/opx";
import { runEslint, type EslintRunSpec } from "./eslint-runner.js";
import { useScratch } from "./testing.js";

const scratch = useScratch();

type Fake = {
	options: Record<string, unknown>;
	patterns: string[];
	fixed: boolean;
	ignoreLoaded: boolean;
	spec: EslintRunSpec;
};

/** Build a spec whose ESLint is a stub that records how it was driven. */
function makeSpec(errorCount: number, formatted = "problems"): Fake {
	const fake = { options: {}, patterns: [], fixed: false, ignoreLoaded: false } as unknown as Fake;
	class FakeEslint {
		static async outputFixes(): Promise<void> {
			fake.fixed = true;
		}
		constructor(options: Record<string, unknown>) {
			fake.options = options;
		}
		async lintFiles(patterns: string[]) {
			fake.patterns = patterns;
			return [{ errorCount }];
		}
		async loadFormatter() {
			return { format: () => formatted };
		}
	}
	fake.spec = {
		key: "x",
		extensions: new Set([".x"]),
		defaultPaths: () => ["default/**"],
		configDir: "/pkg",
		loadEslint: async () => FakeEslint as never,
		loadIgnoreFile: async () => {
			fake.ignoreLoaded = true;
			return (path: string) => ({ ignores: [path] });
		},
	};
	return fake;
}

function makeCtx(cwd: string, overrides: Partial<DetectorContext> = {}): DetectorContext & { out: () => string } {
	let out = "";
	return {
		cwd,
		config: { version: 1, lint: {} },
		fix: false,
		write: (chunk: string) => { out += chunk; },
		out: () => out,
		...overrides,
	} as unknown as DetectorContext & { out: () => string };
}

describe("runEslint", () => {
	const dir = scratch.dir("opx-eslint-runner-");

	it("lints the default paths with the bundled config and returns 0 when clean", async () => {
		const fake = makeSpec(0, "");
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, [], fake.spec)).toBe(0);
		expect(fake.patterns).toEqual(["default/**"]);
		expect(fake.options.overrideConfigFile).toBe(join("/pkg", "eslint.config.js"));
		expect(fake.options.cacheLocation).toBe(join(dir, ".opx", "cache", "eslint", "x"));
		expect(ctx.out()).toBe("");
	});

	it("returns 1 and writes the formatted report when a file has errors", async () => {
		const fake = makeSpec(2);
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, [], fake.spec)).toBe(1);
		expect(ctx.out()).toBe("problems\n");
	});

	it("returns 0 but still writes the report when a file has only warnings", async () => {
		const fake = makeSpec(0, "1 warning");
		const ctx = makeCtx(dir);
		expect(await runEslint(ctx, [], fake.spec)).toBe(0);
		expect(ctx.out()).toBe("1 warning\n");
	});

	it("forwards only owned paths and skips ESLint when none are owned", async () => {
		const fake = makeSpec(0);
		expect(await runEslint(makeCtx(dir), ["a.x", "b.y"], fake.spec)).toBe(0);
		expect(fake.patterns).toEqual(["a.x"]);

		const skipped = makeSpec(0);
		expect(await runEslint(makeCtx(dir), ["b.y"], skipped.spec)).toBe(0);
		expect(skipped.patterns).toEqual([]);
	});

	it("resolves a config override against the repo root unless it is absolute", async () => {
		const relative = makeSpec(0);
		await runEslint(makeCtx(dir, { config: { version: 1, lint: { x: "cfg.js" as never } } }), [], relative.spec);
		expect(relative.options.overrideConfigFile).toBe(resolve(dir, "cfg.js"));

		const absolute = makeSpec(0);
		await runEslint(makeCtx(dir, { config: { version: 1, lint: { x: "/abs/cfg.js" as never } } }), [], absolute.spec);
		expect(absolute.options.overrideConfigFile).toBe("/abs/cfg.js");
	});

	it("loads .gitignore as a base config only when the file exists", async () => {
		const bare = makeSpec(0);
		await runEslint(makeCtx(scratch.dir("opx-eslint-bare-")), [], bare.spec);
		expect(bare.ignoreLoaded).toBe(false);
		expect(bare.options.baseConfig).toBeUndefined();

		const withIgnore = scratch.dir("opx-eslint-ignore-");
		writeFileSync(join(withIgnore, ".gitignore"), "dist\n");
		const ignored = makeSpec(0);
		await runEslint(makeCtx(withIgnore), [], ignored.spec);
		expect(ignored.ignoreLoaded).toBe(true);
		expect(ignored.options.baseConfig).toEqual([{ ignores: [join(withIgnore, ".gitignore")] }]);
	});

	it("writes fixes only when fix is on", async () => {
		const off = makeSpec(0);
		await runEslint(makeCtx(dir), [], off.spec);
		expect(off.fixed).toBe(false);

		const on = makeSpec(0);
		await runEslint(makeCtx(dir, { fix: true }), [], on.spec);
		expect(on.fixed).toBe(true);
	});
});
