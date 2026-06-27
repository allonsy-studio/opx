import { jest } from "@jest/globals";

import type { Changeset } from "@changesets/types";
import type { DetectorContext } from "@allons-y/opx";

import {
	parseAddArgs,
	hasAddFlags,
	toChangeset,
	changesetFromFlags,
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
		});
		expect(parseAddArgs(["--empty"])).toEqual({ empty: true, pkgs: [] });
	});

	it("ignores unknown tokens", () => {
		expect(parseAddArgs(["status", "--weird"])).toEqual({ empty: false, pkgs: [] });
	});
});

describe("hasAddFlags", () => {
	it("is false for an empty parse and true when any flag is present", () => {
		expect(hasAddFlags({ empty: false, pkgs: [] })).toBe(false);
		expect(hasAddFlags({ empty: true, pkgs: [] })).toBe(true);
		expect(hasAddFlags({ empty: false, pkgs: ["x"] })).toBe(true);
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
	function deps(over: Partial<AddDeps> = {}): { deps: AddDeps; written: Changeset[] } {
		const written: Changeset[] = [];
		const base: AddDeps = {
			isInteractive: () => true,
			listPackages: async () => PACKAGES,
			collect: async () => toChangeset([{ name: "@scope/a", type: "patch" }], "interactive"),
			write: async (cs) => {
				written.push(cs);
				return "abc-123";
			},
			...over,
		};
		return { deps: base, written };
	}

	let log: ReturnType<typeof jest.spyOn>;
	let err: ReturnType<typeof jest.spyOn>;

	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		err = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => jest.restoreAllMocks());

	it("writes the changeset built from flags without prompting", async () => {
		const collect = jest.fn(async () => null as Changeset | null);
		const { deps: d, written } = deps({ collect });

		const code = await runAdd(ctx(), ["--type", "minor", "--pkg", "@scope/b", "--summary", "via flags"], d);

		expect(code).toBe(0);
		expect(collect).not.toHaveBeenCalled();
		expect(written).toEqual([{ summary: "via flags", releases: [{ name: "@scope/b", type: "minor" }] }]);
		expect(log.mock.calls.flat().join(" ")).toContain(".changeset/abc-123.md");
	});

	it("prompts when interactive and no flags are given", async () => {
		const { deps: d, written } = deps();

		const code = await runAdd(ctx(), [], d);

		expect(code).toBe(0);
		expect(written).toEqual([toChangeset([{ name: "@scope/a", type: "patch" }], "interactive")]);
	});

	it("returns 1 and refuses to prompt in a non-interactive shell with no flags", async () => {
		const write = jest.fn(async () => "x");
		const { deps: d } = deps({ isInteractive: () => false, write });

		const code = await runAdd(ctx(), [], d);

		expect(code).toBe(1);
		expect(write).not.toHaveBeenCalled();
		expect(err.mock.calls.flat().join(" ")).toMatch(/interactive terminal|--type/);
	});

	it("returns 1 when the interactive flow is cancelled", async () => {
		const { deps: d, written } = deps({ collect: async () => null });

		const code = await runAdd(ctx(), [], d);

		expect(code).toBe(1);
		expect(written).toEqual([]);
	});

	it("returns 1 with a message on invalid flags", async () => {
		const write = jest.fn(async () => "x");
		const { deps: d } = deps({ write });

		const code = await runAdd(ctx(), ["--type", "nope", "--pkg", "@scope/a", "--summary", "x"], d);

		expect(code).toBe(1);
		expect(write).not.toHaveBeenCalled();
		expect(err.mock.calls.flat().join(" ")).toContain("invalid --type");
	});
});
