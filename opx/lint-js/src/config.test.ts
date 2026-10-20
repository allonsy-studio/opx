import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Block = { files?: string[]; rules?: Record<string, unknown> };

const CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), "..", "eslint.config.js");

/**
 * Load the bundled config.
 *
 * @returns Its blocks, and every rule merged to its final setting.
 */
async function load(): Promise<{ blocks: Block[]; rules: Record<string, unknown> }> {
	const blocks = (await import(pathToFileURL(CONFIG).href)).default as Block[];
	const rules = Object.assign({}, ...blocks.map((block) => block.rules ?? {}));
	return { blocks, rules };
}

describe("bundled eslint.config.js", () => {
	it.each([
		"no-var",
		"prefer-const",
		"prefer-arrow-callback",
		"prefer-template",
		"prefer-spread",
		"prefer-rest-params",
		"prefer-object-spread",
		"object-shorthand",
	])("sets %s to error", async (rule) => {
		expect((await load()).rules[rule]).toBe("error");
	});

	it("lets no-unused-vars ignore rest siblings", async () => {
		expect((await load()).rules["no-unused-vars"]).toEqual(["error", { ignoreRestSiblings: true }]);
	});

	it("keeps no-console opt-in", async () => {
		expect((await load()).rules).not.toHaveProperty("no-console");
	});

	it("sets the @stylistic spacing rules that tidy the prefer-template and prefer-object-spread fixes", async () => {
		const { rules } = await load();
		expect(rules["@stylistic/template-curly-spacing"]).toEqual(["error", "never"]);
		expect(rules["@stylistic/object-curly-spacing"]).toEqual(["error", "always"]);
	});

	it("scopes every rule block to JavaScript files so it composes with the other opx configs", async () => {
		const { blocks } = await load();
		for (const block of blocks.filter((b) => b.rules)) {
			expect(block.files).toBeDefined();
			for (const glob of block.files ?? []) expect(glob).toMatch(/\.\{?[cm]?jsx?[,}]|\.[cm]?jsx?$/);
		}
	});
});
