import { jest } from "@jest/globals";

import type { Changeset } from "@changesets/types";
import type { DetectorContext } from "@allons-y/opx";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

import {
	parseAddArgs,
	hasAddFlags,
	toChangeset,
	changesetFromFlags,
	listReleasablePackages,
	runAdd,
	type AddDeps,
	type ReleasablePackage,
} from "./add.js";

const PACKAGES: ReleasablePackage[] = [
	{ name: "@scope/a", version: "1.0.0" },
	{ name: "@scope/b", version: "2.0.0" },
];

function ctx(): DetectorContext {
	return { cwd: "/repo" } as unknown as DetectorContext;
}

describe("parseAddArgs", () => {
	it("collects --type, repeatable/comma --pkg, --summary, and --empty", () => {
		expect(parseAddArgs(["add"].slice(1).concat(["--type", "minor", "--pkg", "@scope/a", "--pkg", "@scope/b,@scope/c", "--summary", "hi"]))).toEqual({
			empty: false,
			type: "minor",
			pkgs: ["@scope/a", "@scope/b", "@scope/c"],
			summary: "hi",
			positionals: [],
		});
		expect(parseAddArgs(["--empty"])).toEqual({ empty: true, pkgs: [], positionals: [] });
	});

	it("ignores unknown flags and keeps bare words", () => {
		expect(parseAddArgs(["status", "--weird"])).toEqual({ empty: false, pkgs: [], positionals: ["status"] });
	});
});

describe("hasAddFlags", () => {
	it("is false for an empty parse and true when any flag is present", () => {
		expect(hasAddFlags({ empty: false, pkgs: [], positionals: [] })).toBe(false);
		expect(hasAddFlags({ empty: true, pkgs: [], positionals: [] })).toBe(true);
		expect(hasAddFlags({ empty: false, pkgs: ["x"], positionals: [] })).toBe(true);
		expect(hasAddFlags({ empty: false, pkgs: [], summary: "s" })).toBe(true);
	});
});

describe("toChangeset", () => {
	it("trims the summary and maps releases", () => {
		expect(toChangeset([{ name: "@scope/a", type: "minor" }], "  hello  ")).toEqual({
			summary: "hello",
			releases: [{ name: "@scope/a", type: "minor" }],
		});
	});
});

describe("changesetFromFlags", () => {
	it("builds a changeset from valid flags", () => {
		const cs = changesetFromFlags({ empty: false, type: "major", pkgs: ["@scope/a"], summary: "boom" }, PACKAGES);
		expect(cs).toEqual({ summary: "boom", releases: [{ name: "@scope/a", type: "major" }] });
	});

	it("returns an empty changeset for --empty", () => {
		expect(changesetFromFlags({ empty: true, pkgs: [] }, PACKAGES)).toEqual({ summary: "", releases: [] });
	});

	it("rejects a missing type, bad type, no packages, unknown packages, and empty summary", () => {
		expect(() => changesetFromFlags({ empty: false, pkgs: ["@scope/a"], summary: "x" }, PACKAGES)).toThrow(/--type/);
		expect(() => changesetFromFlags({ empty: false, type: "huge", pkgs: ["@scope/a"], summary: "x" }, PACKAGES)).toThrow(/invalid --type/);
		expect(() => changesetFromFlags({ empty: false, type: "minor", pkgs: [], summary: "x" }, PACKAGES)).toThrow(/--pkg/);
		expect(() => changesetFromFlags({ empty: false, type: "minor", pkgs: ["@scope/nope"], summary: "x" }, PACKAGES)).toThrow(/unknown package/);
		expect(() => changesetFromFlags({ empty: false, type: "minor", pkgs: ["@scope/a"], summary: "  " }, PACKAGES)).toThrow(/--summary/);
	});
});

describe("runAdd", () => {
	function deps(over: Partial<AddDeps> = {}): { deps: AddDeps; written: Changeset[]; prompt: jest.Mock<AddDeps["prompt"]> } {
		const written: Changeset[] = [];
		const prompt = jest.fn<AddDeps["prompt"]>(async () => 0);
		const base: AddDeps = {
			isInteractive: () => true,
			listPackages: async () => PACKAGES,
			write: async (cs) => {
				written.push(cs);
				return "abc-123";
			},
			prompt,
			...over,
		};
		return { deps: base, written, prompt };
	}

	let log: ReturnType<typeof jest.spyOn>;
	let err: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		err = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => jest.restoreAllMocks());

	it.each(["status", "version", "publish", "pre"])("points `%s` at its own subcommand instead of prompting", async (word) => {
		const { deps: d, written, prompt } = deps();

		expect(await runAdd(ctx(), [word], d)).toBe(1);
		expect(prompt).not.toHaveBeenCalled();
		expect(written).toHaveLength(0);
		expect(err).toHaveBeenCalledWith(expect.stringContaining(`opx release ${word}`));
	});

	it("writes the changeset built from flags without prompting", async () => {
		const { deps: d, written, prompt } = deps();

		const code = await runAdd(ctx(), ["--type", "minor", "--pkg", "@scope/b", "--summary", "via flags"], d);

		expect(code).toBe(0);
		expect(prompt).not.toHaveBeenCalled();
		expect(written).toEqual([{ summary: "via flags", releases: [{ name: "@scope/b", type: "minor" }] }]);
		expect(log.mock.calls.flat().join(" ")).toContain(".changeset/abc-123.md");
	});

	it("hands a terminal session to changesets' own prompt, passing every argument through", async () => {
		const { deps: d, written, prompt } = deps();
		prompt.mockResolvedValueOnce(3);

		expect(await runAdd(ctx(), ["--open", "--since", "main"], d)).toBe(3);
		expect(prompt).toHaveBeenCalledWith("/repo", ["--open", "--since", "main"]);
		expect(written).toHaveLength(0);
	});

	it("returns 1 and refuses to prompt in a non-interactive shell with no flags", async () => {
		const { deps: d, written, prompt } = deps({ isInteractive: () => false });

		expect(await runAdd(ctx(), [], d)).toBe(1);
		expect(prompt).not.toHaveBeenCalled();
		expect(written).toHaveLength(0);
		expect(err.mock.calls.flat().join(" ")).toMatch(/interactive terminal|--type/);
	});

	it("returns 1 with a message on invalid flags", async () => {
		const { deps: d, written } = deps();

		const code = await runAdd(ctx(), ["--type", "nope", "--pkg", "@scope/a", "--summary", "x"], d);

		expect(code).toBe(1);
		expect(written).toHaveLength(0);
		expect(err.mock.calls.flat().join(" ")).toContain("invalid --type");
	});
});

describe("listReleasablePackages", () => {
	const scratch = useScratch();

	/** A workspace with a public, a private, an ignored, and an unversioned package. */
	function workspace(config: Record<string, unknown>): string {
		const dir = scratch.dir("opx-add-");
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }));
		const pkgs = { pub: { version: "1.0.0" }, priv: { version: "1.0.0", private: true }, skipped: { version: "1.0.0" }, nover: {} };
		for (const [name, extra] of Object.entries(pkgs)) {
			mkdirSync(join(dir, "packages", name), { recursive: true });
			writeFileSync(join(dir, "packages", name, "package.json"), JSON.stringify({ name, ...extra }));
		}
		mkdirSync(join(dir, ".changeset"));
		writeFileSync(join(dir, ".changeset", "config.json"), JSON.stringify({ baseBranch: "main", ignore: ["skipped"], ...config }));
		return dir;
	}

	it("offers what `changeset add` offers: no ignored or unversioned packages", async () => {
		const names = (await listReleasablePackages(workspace({}))).map((pkg) => pkg.name);
		expect(names).toEqual(["priv", "pub"]);
	});

	it("leaves out private packages when `privatePackages.version` is off", async () => {
		const names = (await listReleasablePackages(workspace({ privatePackages: { version: false, tag: false } }))).map((pkg) => pkg.name);
		expect(names).toEqual(["pub"]);
	});

	it("rejects an ignored package passed as a flag", async () => {
		const available = await listReleasablePackages(workspace({}));
		expect(() => changesetFromFlags({ empty: false, type: "patch", pkgs: ["skipped"], summary: "x" }, available)).toThrow(/unknown package\(s\): skipped/);
	});
});
