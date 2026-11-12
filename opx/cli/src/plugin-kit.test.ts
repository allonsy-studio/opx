import { jest } from "@jest/globals";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "shared/testing.js";

const buildContext = jest.fn();
jest.unstable_mockModule("./context.js", () => ({ buildContext }));

const { installsPeers, missingPeers, quoteSpec, splitCommand, toAction } = await import("./plugin-kit.js");

const scratch = useScratch();

describe("toAction", () => {
	let exit: ReturnType<typeof jest.spyOn>;
	beforeEach(() => {
		buildContext.mockReturnValue({ cwd: "/x" });
		exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
	});
	afterEach(() => jest.restoreAllMocks());

	it("builds a context for the cwd and exits with the handler's code", async () => {
		const handler = jest.fn<() => Promise<number>>().mockResolvedValue(3);
		await toAction(handler as never)(["a.js"]);
		expect(buildContext).toHaveBeenCalledWith({ cwd: process.cwd() });
		expect(handler).toHaveBeenCalledWith({ cwd: "/x" }, ["a.js"]);
		expect(exit).toHaveBeenCalledWith(3);
	});

	it("passes an empty argument list when none are given", async () => {
		const handler = jest.fn<() => Promise<number>>().mockResolvedValue(0);
		await toAction(handler as never)();
		expect(handler).toHaveBeenCalledWith({ cwd: "/x" }, []);
		expect(exit).toHaveBeenCalledWith(0);
	});
});

describe("prerelease tags", () => {
	it("reads the dist-tag from a prerelease version and ignores stable ones", async () => {
		const { prereleaseTag, withTag } = await import("./plugin-kit.js");
		expect(prereleaseTag("1.0.0-beta.3")).toBe("beta");
		expect(prereleaseTag("2.0.0-rc")).toBe("rc");
		expect(prereleaseTag("1.0.0")).toBeUndefined();
		expect(prereleaseTag(undefined)).toBeUndefined();
		expect(withTag(["a", "b"], "beta")).toEqual(["a@beta", "b@beta"]);
		expect(withTag(["@scope/a", "@scope/b@^1.0.0-beta.1"], "beta")).toEqual(["@scope/a@beta", "@scope/b@^1.0.0-beta.1"]);
		expect(withTag(["a"], undefined)).toEqual(["a"]);
	});
});

describe("install specs", () => {
	it("quotes a range with spaces or shell characters, and splits it back into one argument", () => {
		expect(quoteSpec("typescript@^6")).toBe("typescript@^6");
		expect(quoteSpec("typescript@^5.0.0 || ^6.0.0")).toBe('"typescript@^5.0.0 || ^6.0.0"');
		expect(splitCommand(`yarn add -D a ${quoteSpec("typescript@^5.0.0 || ^6.0.0")}`)).toEqual(["yarn", "add", "-D", "a", "typescript@^5.0.0 || ^6.0.0"]);
	});

	it("knows which package managers install peers themselves", () => {
		expect([installsPeers("npm"), installsPeers("pnpm"), installsPeers("bun"), installsPeers("yarn")]).toEqual([true, true, true, false]);
	});
});

describe("missingPeers", () => {
	const plugin = (dir: string, name: string, manifest: object): void => {
		mkdirSync(join(dir, "node_modules", ...name.split("/")), { recursive: true });
		writeFileSync(join(dir, "node_modules", ...name.split("/"), "package.json"), JSON.stringify(manifest));
	};

	it("lists required peers the host lacks, from the plugin's own ranges, skipping optional ones", () => {
		const dir = scratch.repo({});
		plugin(dir, "@s/p", { peerDependencies: { a: "^1 || ^2", b: "*", c: "1" }, peerDependenciesMeta: { b: { optional: true } } });
		expect(missingPeers(dir, ["@s/p"], { devDependencies: { c: "1" } })).toEqual({ specs: ["a@^1 || ^2"], conflicts: [], unreadable: [] });
	});

	it("finds a plugin hoisted to a parent node_modules, and reports one it can't find", () => {
		const dir = scratch.repo({});
		plugin(dir, "p", { peerDependencies: { a: "1" } });
		mkdirSync(join(dir, "packages/app"), { recursive: true });
		expect(missingPeers(join(dir, "packages/app"), ["p", "gone"], {})).toEqual({ specs: ["a@1"], conflicts: [], unreadable: ["gone"] });
	});

	describe("a peer the project already has", () => {
		const peerOf = (range: string): object => ({ peerDependencies: { a: range } });

		it("is reported, never listed to install, when the installed version is outside the plugin's range", () => {
			const dir = scratch.repo({});
			plugin(dir, "p", peerOf("^5 || ^6"));
			plugin(dir, "a", { version: "7.0.2" });
			expect(missingPeers(dir, ["p"], { devDependencies: { a: "^7.0.0" } })).toEqual({
				specs: [],
				conflicts: [{ plugin: "p", peer: "a", found: "7.0.2", range: "^5 || ^6" }],
				unreadable: [],
			});
		});

		it("is accepted when the installed version fits, even if the declared range is wider", () => {
			const dir = scratch.repo({});
			plugin(dir, "p", peerOf("^5 || ^6"));
			plugin(dir, "a", { version: "6.1.0" });
			expect(missingPeers(dir, ["p"], { devDependencies: { a: ">=5" } }).conflicts).toEqual([]);
		});

		it("is judged by its declared range when nothing is installed to read", () => {
			const dir = scratch.repo({});
			plugin(dir, "p", peerOf("^5 || ^6"));
			expect(missingPeers(dir, ["p"], { devDependencies: { a: "^7.0.0" } }).conflicts).toEqual([{ plugin: "p", peer: "a", found: "^7.0.0", range: "^5 || ^6" }]);
			expect(missingPeers(dir, ["p"], { devDependencies: { a: "^6.0.0" } }).conflicts).toEqual([]);
		});

		it("is left alone when its version can't be compared, as with a tag or a workspace link", () => {
			const dir = scratch.repo({});
			plugin(dir, "p", peerOf("^5 || ^6"));
			for (const declared of ["latest", "workspace:*", "npm:other@^7"]) expect(missingPeers(dir, ["p"], { devDependencies: { a: declared } }).conflicts).toEqual([]);
		});

		it("is not reported when the peer is optional", () => {
			const dir = scratch.repo({});
			plugin(dir, "p", { ...peerOf("^5"), peerDependenciesMeta: { a: { optional: true } } });
			expect(missingPeers(dir, ["p"], { devDependencies: { a: "^7.0.0" } }).conflicts).toEqual([]);
		});
	});
});
