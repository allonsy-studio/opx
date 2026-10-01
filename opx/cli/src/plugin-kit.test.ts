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
