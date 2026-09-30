import type { OpxConfig } from "@allons-y/opx";

import { toggle } from "./toggle.js";

const base = (): OpxConfig => ({ version: 1, lint: {}, build: {}, release: false, test: false });

describe("toggle", () => {
	it("enables a lint-only plugin in lint only", () => {
		const result = toggle(base(), "js", true, {});
		expect(result).toMatchObject({ config: { lint: { js: true }, build: {} } });
	});

	it("sets the boolean for the release task", () => {
		const result = toggle(base(), "release", true, {});
		expect(result).toMatchObject({ config: { release: true, lint: {}, build: {} } });
	});

	it("rejects tasks that are not published", () => {
		expect(toggle(base(), "test", true, {})).toEqual({ error: '"test" is not available yet.' });
	});

	it("rejects unknown plugin names", () => {
		expect(toggle(base(), "css", true, {})).toMatchObject({ error: expect.stringContaining("unknown plugin") });
	});

	it("accepts full package ids and installed short names for both tasks", () => {
		expect(toggle(base(), "@acme/opx-plugin-x", true, {})).toMatchObject({ config: { lint: { "@acme/opx-plugin-x": true }, build: { "@acme/opx-plugin-x": true } } });
		expect(toggle(base(), "foo", true, { devDependencies: { "opx-plugin-foo": "1" } })).toMatchObject({ config: { lint: { foo: true } } });
	});

	it("rejects a requested task the plugin does not provide", () => {
		expect(toggle(base(), "js", true, {}, ["build"])).toEqual({ error: '"js" does not provide: build.' });
	});

	it("honors an explicit task list", () => {
		const result = toggle(base(), "@acme/opx-plugin-x", true, {}, ["build"]);
		expect(result).toMatchObject({ config: { lint: {}, build: { "@acme/opx-plugin-x": true } } });
	});

	it("reports no-ops without changing the config", () => {
		const config = { ...base(), lint: { js: true } };
		expect(toggle(config, "js", true, {})).toMatchObject({ config, message: expect.stringContaining("already enabled") });
		expect(toggle(base(), "js", false, {})).toMatchObject({ message: expect.stringContaining("already disabled") });
		expect(toggle({ ...base(), release: true }, "release", true, {})).toMatchObject({ message: expect.stringContaining("already enabled") });
	});

	it("disables a plugin and preserves the others", () => {
		const config = { ...base(), lint: { js: true, md: true } };
		expect(toggle(config, "js", false, {})).toMatchObject({ config: { lint: { md: true } }, message: 'disabled "js" in lint.' });
		expect(toggle({ ...base(), release: true }, "release", false, {})).toMatchObject({ config: { release: false } });
	});
});
