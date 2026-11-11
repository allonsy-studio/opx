import { jest } from "@jest/globals";

const buildContext = jest.fn();
jest.unstable_mockModule("./context.js", () => ({ buildContext }));

const { toAction } = await import("./plugin-kit.js");

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
		expect(withTag(["a"], undefined)).toEqual(["a"]);
	});
});
