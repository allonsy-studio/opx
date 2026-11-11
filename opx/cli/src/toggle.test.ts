import type { OpxConfig } from "@allons-y/opx";

import { toggle } from "./toggle.js";

const base = (): OpxConfig => ({ version: 1, lint: {}, build: {}, release: false, test: false });

describe("toggle", () => {
	it("enables a lint-only plugin in lint only", () => {
		const result = toggle(base(), "js", true, {});
		expect(result).toMatchObject({ config: { lint: { js: true }, build: {} } });
	});

	it("keeps release settings when enabling, since they already turn it on", () => {
		const config = { ...base(), release: { githubReleases: false } };
		expect(toggle(config, "release", true, {})).toMatchObject({ config, message: expect.stringContaining("already enabled") });
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

	it("resolves a first-party package id to its short name and task", () => {
		const result = toggle(base(), "@allons-y/opx-lint-ts", true, {});
		expect(result).toMatchObject({ config: { lint: { ts: true }, build: {} }, message: 'enabled "ts" in lint.' });
		expect(toggle(base(), "ts", true, {})).toMatchObject({ config: { lint: { ts: true } } });
	});

	it("writes a third-party id only to the tasks its detectors declare", () => {
		const result = toggle(base(), "@acme/opx-plugin-x", true, {}, undefined, ["build"]);
		expect(result).toMatchObject({ config: { lint: {}, build: { "@acme/opx-plugin-x": true } } });
	});

	it("refuses a third-party id whose task is unknown rather than writing to every task", () => {
		const result = toggle(base(), "@acme/opx-plugin-x", true, {});
		expect(result).toMatchObject({ error: expect.stringContaining("--task") });
	});

	it("errors when a loaded plugin declares no lint or build concern", () => {
		expect(toggle(base(), "@acme/opx-plugin-x", true, {}, undefined, [])).toMatchObject({ error: expect.stringContaining("no lint or build") });
	});

	it("writes an installed short name under its package id", () => {
		const hostPkg = { devDependencies: { "opx-plugin-foo": "1" } };
		expect(toggle(base(), "foo", true, hostPkg, ["lint"])).toMatchObject({ config: { lint: { "opx-plugin-foo": true } } });
	});

	it("disables a third-party id wherever it is set", () => {
		const config = { ...base(), lint: { "@acme/opx-plugin-x": true, js: true }, build: { "@acme/opx-plugin-x": true } };
		expect(toggle(config, "@acme/opx-plugin-x", false, {})).toMatchObject({ config: { lint: { js: true }, build: {} }, message: 'disabled "@acme/opx-plugin-x" in lint, build.' });
	});

	it("clears a package-id entry left by an earlier enable when disabling by id", () => {
		const config = { ...base(), lint: { "@allons-y/opx-lint-ts": true }, build: { "@allons-y/opx-lint-ts": true } };
		expect(toggle(config, "@allons-y/opx-lint-ts", false, {})).toMatchObject({ config: { lint: {}, build: {} } });
	});

	it("reports disabling an unset third-party id as a no-op", () => {
		expect(toggle(base(), "@acme/opx-plugin-x", false, {})).toMatchObject({ message: expect.stringContaining("already disabled") });
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

	it("points a new plugin at the config file the others share", () => {
		const config = { ...base(), lint: { js: "./eslint.config.js", md: "./eslint.config.js", json: false } };
		const result = toggle(config, "ts", true, {});
		expect(result).toMatchObject({ config: { lint: { ts: "./eslint.config.js" } }, message: expect.stringContaining("lint uses ./eslint.config.js") });
	});

	it("enables with true when the other plugins disagree", () => {
		const config = { ...base(), lint: { js: "./eslint.config.js", md: true } };
		expect(toggle(config, "ts", true, {})).toMatchObject({ config: { lint: { ts: true } }, message: 'enabled "ts" in lint.' });
	});

	it("keeps a plugin's config path when it is enabled again", () => {
		const config = { ...base(), lint: { js: "./eslint.config.js" } };
		expect(toggle(config, "js", true, {})).toMatchObject({ config, message: expect.stringContaining("already enabled") });
	});

	it("disables a plugin and preserves the others", () => {
		const config = { ...base(), lint: { js: true, md: true } };
		expect(toggle(config, "js", false, {})).toMatchObject({ config: { lint: { md: true } }, message: 'disabled "js" in lint.' });
		expect(toggle({ ...base(), release: true }, "release", false, {})).toMatchObject({ config: { release: false } });
	});
});
