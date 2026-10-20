import { jest } from "@jest/globals";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { useScratch } from "shared/testing.js";

/** The part of a prompt these tests read. */
type Prompt = {
	message: string;
	required?: boolean;
	options?: Array<{ value: unknown; label?: string; hint?: string }>;
	validate?: (value: string) => string | undefined;
};

const CANCEL = Symbol("cancel");
const select = jest.fn<(o: Prompt) => Promise<unknown>>();
const multiselect = jest.fn<(o: Prompt) => Promise<unknown>>();
const text = jest.fn<(o: Prompt) => Promise<unknown>>();
const intro = jest.fn();
const outro = jest.fn();

jest.unstable_mockModule("@clack/prompts", () => ({
	intro,
	outro,
	select,
	multiselect,
	text,
	isCancel: (value: unknown) => value === CANCEL,
}));

const { collectInteractively, isInteractive, listReleasablePackages } = await import("./add.js");

const scratch = useScratch();
const PACKAGES = [
	{ name: "@s/a", version: "1.0.0" },
	{ name: "@s/b", version: "2.1.0" },
];
const PER_PACKAGE = "__per_package__";

beforeEach(() => {
	jest.clearAllMocks();
	text.mockResolvedValue("A change");
});

describe("collectInteractively", () => {
	it("lists each package with its version and requires a choice", async () => {
		multiselect.mockResolvedValue(["@s/a"]);
		select.mockResolvedValue("patch");
		await collectInteractively(PACKAGES);

		const prompt = multiselect.mock.calls[0]?.[0];
		expect(prompt?.message).toBe("Which packages changed?");
		expect(prompt?.required).toBe(true);
		expect(prompt?.options).toEqual([
			{ value: "@s/a", label: "@s/a", hint: "1.0.0" },
			{ value: "@s/b", label: "@s/b", hint: "2.1.0" },
		]);
	});

	it("applies one bump to every selected package", async () => {
		multiselect.mockResolvedValue(["@s/a", "@s/b"]);
		select.mockResolvedValue("minor");
		text.mockResolvedValue("  Add a thing  ");

		expect(await collectInteractively(PACKAGES)).toEqual({
			summary: "Add a thing",
			releases: [
				{ name: "@s/a", type: "minor" },
				{ name: "@s/b", type: "minor" },
			],
		});
		expect(select).toHaveBeenCalledTimes(1);
	});

	it("offers the three bumps and a per-package choice", async () => {
		multiselect.mockResolvedValue(["@s/a"]);
		select.mockResolvedValue("patch");
		await collectInteractively(PACKAGES);

		const values = select.mock.calls[0]?.[0].options?.map((option) => option.value);
		expect(values).toEqual(["patch", "minor", "major", PER_PACKAGE]);
	});

	it("asks for each package in turn when told to choose per package", async () => {
		multiselect.mockResolvedValue(["@s/a", "@s/b"]);
		select.mockResolvedValueOnce(PER_PACKAGE).mockResolvedValueOnce("major").mockResolvedValueOnce("patch");

		expect(await collectInteractively(PACKAGES)).toEqual({
			summary: "A change",
			releases: [
				{ name: "@s/a", type: "major" },
				{ name: "@s/b", type: "patch" },
			],
		});
		expect(select.mock.calls.map(([o]) => o.message)).toEqual(["Bump type for the selected packages?", "Bump for @s/a?", "Bump for @s/b?"]);
	});

	it("requires a summary and says so", async () => {
		multiselect.mockResolvedValue(["@s/a"]);
		select.mockResolvedValue("patch");
		await collectInteractively(PACKAGES);

		const validate = text.mock.calls[0]?.[0].validate;
		if (typeof validate !== "function") throw new Error("expected the summary prompt to take a validate function");
		expect(validate("")).toBe("A summary is required.");
		expect(validate("   ")).toBe("A summary is required.");
		expect(validate("ok")).toBeUndefined();
	});

	it("says what it recorded", async () => {
		multiselect.mockResolvedValueOnce(["@s/a"]).mockResolvedValueOnce(["@s/a", "@s/b"]);
		select.mockResolvedValue("patch");

		await collectInteractively(PACKAGES);
		expect(outro).toHaveBeenLastCalledWith("Recorded a change for 1 package(s).");
		await collectInteractively(PACKAGES);
		expect(outro).toHaveBeenLastCalledWith("Recorded a change set for 2 package(s).");
		expect(intro).toHaveBeenCalledWith("opx release — record a change");
	});

	describe("when the person cancels", () => {
		it.each([
			["choosing packages", () => multiselect.mockResolvedValue(CANCEL)],
			[
				"choosing the bump",
				() => {
					multiselect.mockResolvedValue(["@s/a"]);
					select.mockResolvedValue(CANCEL);
				},
			],
			[
				"choosing a bump for one package",
				() => {
					multiselect.mockResolvedValue(["@s/a", "@s/b"]);
					select.mockResolvedValueOnce(PER_PACKAGE).mockResolvedValueOnce("patch").mockResolvedValueOnce(CANCEL);
				},
			],
			[
				"writing the summary",
				() => {
					multiselect.mockResolvedValue(["@s/a"]);
					select.mockResolvedValue("patch");
					text.mockResolvedValue(CANCEL);
				},
			],
		])("returns null when cancelled while %s", async (_where, setup) => {
			setup();
			expect(await collectInteractively(PACKAGES)).toBeNull();
			expect(outro).not.toHaveBeenCalled();
		});
	});
});

describe("isInteractive", () => {
	const saved = { ni: process.env.OPX_NONINTERACTIVE, ci: process.env.CI, tty: process.stdout.isTTY };
	const setTty = (value: boolean): void => void Object.defineProperty(process.stdout, "isTTY", { value, configurable: true });

	beforeEach(() => {
		delete process.env.OPX_NONINTERACTIVE;
		delete process.env.CI;
		setTty(true);
	});
	afterEach(() => {
		if (saved.ni === undefined) delete process.env.OPX_NONINTERACTIVE; else process.env.OPX_NONINTERACTIVE = saved.ni;
		if (saved.ci === undefined) delete process.env.CI; else process.env.CI = saved.ci;
		setTty(Boolean(saved.tty));
	});

	it("is true in a terminal", () => {
		expect(isInteractive()).toBe(true);
	});

	it("is false when OPX_NONINTERACTIVE or CI is set, or there is no terminal", () => {
		process.env.OPX_NONINTERACTIVE = "1";
		expect(isInteractive()).toBe(false);
		delete process.env.OPX_NONINTERACTIVE;

		process.env.CI = "true";
		expect(isInteractive()).toBe(false);
		delete process.env.CI;

		setTty(false);
		expect(isInteractive()).toBe(false);
	});
});

describe("listReleasablePackages", () => {
	it("lists public workspace packages by name and skips private ones and the root", async () => {
		const root = scratch.dir("opx-workspace-");
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }));
		for (const [dir, pkg] of Object.entries({
			b: { name: "@s/b", version: "2.1.0" },
			a: { name: "@s/a", version: "1.0.0" },
			hidden: { name: "@s/hidden", version: "0.0.1", private: true },
		})) {
			mkdirSync(join(root, "packages", dir), { recursive: true });
			writeFileSync(join(root, "packages", dir, "package.json"), JSON.stringify(pkg));
		}

		expect(await listReleasablePackages(root)).toEqual([
			{ name: "@s/a", version: "1.0.0" },
			{ name: "@s/b", version: "2.1.0" },
		]);
	});
});
