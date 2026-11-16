# @allons-y/opx-test

opx test plugin. Runs `node --test` behind `opx test`, and adds coverage through [`c8`](https://github.com/bcoe/c8) with thresholds you set in `.opx/config.json`.

## Install

Install via `opx init` (recommended), or manually:

```sh
yarn add --dev @allons-y/opx-test
opx enable test
```

Requires [`@allons-y/opx-cli`](https://www.npmjs.com/package/@allons-y/opx-cli).

`opx enable test` sets `"test": true` in `.opx/config.json`.

## Run

```sh
opx test                          # node --test
opx test src/a.test.js            # paths and flags go to node --test
opx test --coverage               # wrap node --test in c8 and check the thresholds
```

`opx test` runs `node --test` in the repository root with Node's `spec` reporter, unless you pass your own `--test-reporter`. Every argument except `--coverage` goes to `node --test`, so `--test-name-pattern`, `--watch`, and test paths work as [Node documents](https://nodejs.org/api/test.html#running-tests-from-the-command-line).

It exits with `node --test`'s own exit code when a test fails, and `1` when tests pass but coverage falls short or `c8` can't run.

## Coverage

`--coverage` runs the tests under [`c8`](https://github.com/bcoe/c8), which the plugin bundles, and writes a `json-summary` report to `coverage/`. opx reads the totals and compares them with the thresholds you set. Without `--coverage`, thresholds are not checked.

```json
{
  "version": 1,
  "test": { "coverage": { "lines": 98, "branches": 94 } }
}
```

| Setting | Meaning |
| --- | --- |
| `coverage.lines` | Minimum percentage of lines covered |
| `coverage.statements` | Minimum percentage of statements covered |
| `coverage.functions` | Minimum percentage of functions covered |
| `coverage.branches` | Minimum percentage of branches covered |

Each is a number from 0 to 100, and a metric you leave out isn't checked. With no thresholds, `--coverage` prints the table and passes. A value that isn't a percentage is ignored with a warning.

Settings turn the task on, so you don't also need `"test": true`.

c8 reads your own `.c8rc.json` for `include`, `exclude`, and similar options. opx sets the reporter and the report folder itself, so leave `reporter` and `reportsDir` alone.

Because the plugin bundles c8, you don't install it. If your project already depends on `c8`, opx uses your copy.
