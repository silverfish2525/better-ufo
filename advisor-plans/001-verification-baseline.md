# Plan 001: Harden the CI verification surface and lock in current behavior of untested URL helpers

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` if that file exists; if it does not, skip — the advisor maintains the
> index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat f06c800..HEAD -- .github/workflows/ci.yml package.json test/query.test.ts test/parse.test.ts test/base.test.ts
> ```
>
> If any in-scope file has changed since this plan was written, compare the "Current state" excerpts
> below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests + dx
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

This repo (`unjs/ufo@1.6.4`) has a strong test suite (509 passing tests) and 18 type-level tests in
`test/types.test-d.ts`, but **CI is silently skipping the type-level tests** because
`.github/workflows/ci.yml` runs `pnpm vitest --coverage` without `--typecheck`. Meanwhile several
low-level helpers (`parseAuth`, `parseQuery`, `stringifyQuery`, `encodeQueryItem`) have **zero
direct runtime tests**, and several long-standing bugs (IPv6 host parsing, `withBase`/`withoutBase`
with fragments, `parseAuth` losing colons in passwords) have no regression coverage at all.

The follow-up plans (005 fixes IPv6, 006 fixes base-with-fragment, 007 fixes `parseAuth`) will
change the return values of these functions. If we land those fixes without first pinning the
current behavior in tests, we cannot tell whether an *unrelated* regression slipped in alongside a
targeted fix. This plan installs the characterization tests **first** (with `FIXME(CORR-*)` markers
that later plans will flip), and closes the CI gap so `test/types.test-d.ts` is actually enforced
on every push. It ships zero source-code changes, so risk is minimal.

## Current state

### Files in scope (and their role)

- `.github/workflows/ci.yml` — GitHub Actions workflow; the single `pnpm vitest --coverage`
  invocation on line 23 is the only test run in CI. It does not pass `--typecheck`, so
  `test/types.test-d.ts` never executes in CI. (Note: the initial audit brief said "line 20" — the
  actual line at HEAD `f06c800` is line 23; line 20 is `node-version: 20`.)
- `package.json` — `scripts` block (lines 23–33 at `f06c800`). Has `test`, `dev`, `lint`,
  `lint:fix`, `build`, `automd`, `prepack`, `release`. No `typecheck` script.
- `test/query.test.ts` — currently only tests `getQuery`. Zero runtime hits for `parseQuery`,
  `stringifyQuery`, `encodeQueryItem`. (Verified: `grep -c 'parseQuery\|stringifyQuery\|encodeQueryItem' test/query.test.ts` → `0`.)
- `test/parse.test.ts` — currently tests `parseURL`, `parsePath`. Zero hits for `parseAuth` and no
  IPv6 cases for `parseHost`/`parseURL`. (Verified: `grep -c parseAuth test/parse.test.ts` → `0`.)
- `test/base.test.ts` — tests `withBase`/`withoutBase` for plain paths and query strings, but never
  with a URL fragment (`#...`).

### Excerpts you will need to see (verify these match your working tree)

`.github/workflows/ci.yml` (full file at `f06c800`):

```yaml
name: ci

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm i -fg corepack && corepack enable
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm vitest --coverage
      - uses: codecov/codecov-action@v6
```

`package.json` scripts block at `f06c800` (lines 23–33):

```json
  "scripts": {
    "build": "automd && unbuild",
    "automd": "automd",
    "dev": "vitest",
    "lint": "eslint . && prettier -c src test",
    "lint:fix": "eslint --fix . && prettier -w src test",
    "prepack": "pnpm build",
    "release": "pnpm test && changelogen --release && npm publish && git push --follow-tags",
    "test": "pnpm lint && vitest run --typecheck"
  },
```

### In-flight work you MUST NOT disturb

At the "Planned at" SHA `f06c800`, the working tree has uncommitted type-safety refinements owned
by another plan (`010` — D1 in-flight finalize):

- `src/_types.ts` — new file (~13.8 KB, untracked)
- Modified: `src/index.ts`, `src/parse.ts`, `src/query.ts`, `src/utils.ts`
- Modified: `test/types.test-d.ts` (18 type-level tests, expected to stay green)
- Modified: `tsconfig.json`

`git status --short` at `f06c800` (baseline for this plan) is:

```
 M package.json
 M src/index.ts
 M src/parse.ts
 M src/query.ts
 M src/utils.ts
 M test/types.test-d.ts
 M tsconfig.json
?? src/_types.ts
```

(Additional untracked entries like `.agents/` or `.pi/` may be present — those are advisor tooling
and are fine to ignore.)

**Do not touch any file in `src/`, `test/types.test-d.ts`, or `tsconfig.json` in this plan.** If
`pnpm test` (which runs `pnpm lint && vitest run --typecheck`) does not pass 509 tests + 18 type
tests before you start, STOP (see STOP conditions).

### Current runtime behavior of the functions under test

You will pin these values in characterization tests. **These are the values the code produces
today** — verified by running each expression against `src/` at `f06c800`. Do not "correct" them;
that is the job of plans 005/006/007.

`parseAuth` (from `src/parse.ts`):

| Input             | Current return                            | Note                                         |
| ----------------- | ----------------------------------------- | -------------------------------------------- |
| `"user:pass"`     | `{ username: "user", password: "pass" }`  | happy path                                   |
| `"user"`          | `{ username: "user", password: "" }`      | no colon → empty password (not `undefined`)  |
| `""`              | `{ username: "", password: "" }`          | empty input                                  |
| `"user:pa:ss"`    | `{ username: "user", password: "pa" }`    | **BUG** — drops `":ss"`. Owned by plan 007.  |

`parseHost` (from `src/parse.ts`):

| Input                     | Current return                                | Note                                                              |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `"example.com:8080"`      | `{ hostname: "example.com", port: "8080" }`   | control — non-IPv6 happy path already covered elsewhere; assert it here anyway for clarity |
| `"[::1]:8080"`            | `{ hostname: "[" }`                           | **BUG** — no `port` key at all. Owned by plan 005.                |
| `"[::1]"`                 | `{ hostname: "[" }`                           | **BUG**. Owned by plan 005.                                       |
| `"[2001:db8::1]:443"`     | `{ hostname: "[2001" }`                       | **BUG** — split on the first `:`. Owned by plan 005.              |

Note: `port` is **omitted** from the object (not `undefined`). Use `toEqual({ hostname: "[" })`,
not `toEqual({ hostname: "[", port: undefined })`, or the assertion will fail because
`toEqual` treats a missing key and an explicit `undefined` value as equivalent for object literals,
but adding an explicit `undefined` misleads future readers about the actual return shape.

`withBase` / `withoutBase` (from `src/utils.ts`):

| Call                              | Current return   | Note                                                                        |
| --------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `withBase("/foo#h", "/foo")`      | `"/foo/foo#h"`   | **BUG** — fragment defeats the "already has base" check, so base is prefixed a second time. Owned by plan 006. |
| `withBase("/foo?q=1", "/foo")`    | `"/foo?q=1"`     | control — query strings ARE handled correctly today; assert as regression guard so plan 006 doesn't regress this while fixing fragments. |
| `withoutBase("/foo#h", "/foo")`   | `"/foo#h"`       | **BUG** — base not stripped when fragment is present. Owned by plan 006.    |
| `withoutBase("/foo?q=1", "/foo")` | `"/?q=1"`        | control — query case works today. Assert as regression guard.               |

`parseQuery` / `stringifyQuery` / `encodeQueryItem` (from `src/query.ts`):

| Call                                    | Current return                    |
| --------------------------------------- | --------------------------------- |
| `parseQuery("")`                        | `{}`                              |
| `parseQuery("?")`                       | `{}`                              |
| `parseQuery("a")`                       | `{ a: "" }`                       |
| `parseQuery("a=")`                      | `{ a: "" }`                       |
| `parseQuery("a=&b=")`                   | `{ a: "", b: "" }`                |
| `parseQuery("a=1&a=2")`                 | `{ a: ["1", "2"] }`               |
| `parseQuery("a=hello%20world")`         | `{ a: "hello world" }`            |
| `parseQuery("a=hello+world")`           | `{ a: "hello world" }`            |
| `stringifyQuery({})`                    | `""`                              |
| `stringifyQuery({ a: 1, b: "x y" })`    | `"a=1&b=x+y"` (space → `+`)       |
| `stringifyQuery({ a: [1, 2] })`         | `"a=1&a=2"`                       |
| `encodeQueryItem("k", "v v")`           | `"k=v+v"`                         |
| `encodeQueryItem("k", [1, 2])`          | `"k=1&k=2"`                       |
| `encodeQueryItem("k", null)`            | `"k"` (bare key, no `=`)          |
| `encodeQueryItem("k", undefined)`       | `"k"` (bare key, no `=`)          |

These are stable, correct-looking behaviors (nothing FIXME-worthy) — this is just closing the
runtime-coverage hole documented as finding **TEST-01**.

### Repo conventions

- **Test framework**: Vitest 4.1.x. Existing tests use `describe(...) { it(...) { expect(...) } }`
  imported directly: `import { describe, it, expect } from "vitest"`.
- **Import style**: import functions from `"../src"` (barrel), e.g.
  `import { parseURL, parsePath } from "../src";` — see `test/parse.test.ts:1`.
- **Assertion style**: `expect(fn(input)).toStrictEqual(expected)` or `.toEqual(...)`. Prefer
  `toStrictEqual` for object returns so the shape (including which keys are present vs `undefined`)
  is asserted precisely — matches how `parseHost` tests should distinguish "no `port` key" from
  `port: undefined`.
- **Exemplar to model after**: `test/parse.test.ts` for structure of `describe("parseX", () => { it("...", () => { ... }) })`; `test/base.test.ts` for `withBase`/`withoutBase` style
  (uses `it.each([...])` tables — use the same style for the fragment cases so it reads
  consistently with the surrounding tests).
- **FIXME marker convention**: The advisor's playbook uses `// FIXME(CORR-NN): <one-line note>`
  above the assertion that will flip when the correctness plan lands. Follow that literally, e.g.
  `// FIXME(CORR-03): plan 007 changes this to { username: "user", password: "pa:ss" }` —
  future plans grep for `FIXME(CORR-` to locate the assertions to update.
- **Commit style**: Conventional commits scoped by area, e.g. `fix(utils): withBase should keep hash and search #313`, `feat(query): support parsing space in values with a plus symbol #201`. Use `test(...)`, `ci(...)`, `chore(...)` scopes for this plan.
- **Branch**: `advisor/001-verification-baseline`.

## Commands you will need

| Purpose                      | Command                                                | Expected on success                              |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Install                      | `pnpm install`                                         | exit 0                                           |
| Full test (lint + typecheck) | `pnpm test`                                            | `Test Files N passed`, `Tests M passed`, exit 0  |
| Runtime tests only           | `pnpm vitest run`                                      | exit 0                                           |
| Typecheck only (new)         | `pnpm typecheck`                                       | exit 0 (after Step 2)                            |
| Lint                         | `pnpm lint`                                            | exit 0                                           |
| Build (sanity)               | `pnpm build`                                           | exit 0                                           |

Package manager is pinned via `packageManager: "pnpm@10.33.2"` in `package.json`. Do not use npm or
yarn.

## Suggested executor toolkit

- Skill `vitest` (if available) for `it.each` patterns and `toStrictEqual` vs `toEqual` guidance.
- No other tooling required. The plan is edit-only.

## Scope

**In scope** (the only files you may modify):

- `.github/workflows/ci.yml`
- `package.json` (add exactly one script: `typecheck`)
- `test/query.test.ts` (append new `describe` blocks)
- `test/parse.test.ts` (append new `describe` blocks)
- `test/base.test.ts` (append new `describe` blocks)

**Out of scope** (do NOT touch — even if you spot a bug):

- Anything under `src/**` — plans 005/006/007 own the actual fixes. Any change here means the plan
  expanded; STOP.
- `tsconfig.json` — plan 008 owns tsconfig changes.
- `test/types.test-d.ts` — plan 010 (D1 in-flight finalize) owns type-level tests.
- `src/_types.ts` (untracked new file) — same, owned by plan 010.
- `README.md`, `CHANGELOG.md`, `.prettierrc*`, `.eslintrc*` — irrelevant.
- Do NOT run `pnpm build` and commit the resulting `dist/` — this repo builds `dist/` only on
  release.

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Suggest one commit per step (7 commits total), or squash into three logical groups:
  1. CI + package.json (`ci: enable --typecheck in vitest run` + `chore: add typecheck script`)
  2. Characterization tests (`test(query): add runtime coverage for parseQuery/stringifyQuery/encodeQueryItem`, `test(parse): characterize parseAuth and IPv6 parseHost`, `test(base): characterize withBase/withoutBase with fragments`)
  3. Nothing else.
- Commit message style: conventional commits, matching examples from `git log --oneline -20`:
  - `test(parse): add characterization tests for parseAuth and IPv6 parseHost`
  - `ci: enable --typecheck in vitest run`
- Do NOT push. Do NOT open a PR. Do NOT run `pnpm release`. The operator (or a downstream plan)
  handles publishing.

## Steps

### Step 0: Confirm baseline is green

Run the drift check and the baseline test run *before* editing anything.

```bash
cd /Users/i584843/SAPDevelop/dev/ufo
git rev-parse --short HEAD
git status --short
pnpm install
pnpm test
```

**Verify**:

- `git rev-parse --short HEAD` → `f06c800` (or newer, if the D1 in-flight work has been
  committed — then re-read the STOP conditions).
- `git status --short` → shows exactly the in-flight modifications listed under "In-flight work
  you MUST NOT disturb" (`M package.json`, `M src/{index,parse,query,utils}.ts`,
  `M test/types.test-d.ts`, `M tsconfig.json`, `?? src/_types.ts`).
- `pnpm test` → exits 0. Final lines report `Test Files N passed`, `Tests M passed` where
  N ≥ 14 test files and M ≥ 509 tests (509 runtime + 18 type-level = 527 at the time this plan was
  written; small drift acceptable). If either the exit code is non-zero or the pass count is lower
  than 509, STOP.

### Step 1: Enable `--typecheck` in CI (DX-01)

Edit `.github/workflows/ci.yml`. Change the line that reads:

```yaml
- run: pnpm vitest --coverage
```

to:

```yaml
- run: pnpm vitest run --typecheck --coverage
```

Rationale for the exact form:

- `run` explicitly opts into non-watch mode. This matches the local `pnpm test` script
  (`vitest run --typecheck`) and eliminates any risk of vitest defaulting to watch mode in a
  non-TTY CI environment.
- `--typecheck` enables the vitest typecheck reporter, so `test/types.test-d.ts` (the 18 `expectTypeOf` / `assertType` tests) actually runs.
- `--coverage` preserved — codecov step downstream depends on the coverage report.

Do NOT change:

- The Node version pin (`node-version: 20`) — plan 003 (if it exists) or a follow-up may add
  matrix testing; not in this plan.
- The `pnpm build` step or the codecov step.

**Verify**:

```bash
git diff HEAD -- .github/workflows/ci.yml
```

Expected: a single-line change, replacing `pnpm vitest --coverage` with
`pnpm vitest run --typecheck --coverage`. No other lines modified.

```bash
git diff HEAD --stat -- .github/
```

Expected: `.github/workflows/ci.yml | 2 +-` (1 insertion, 1 deletion).

Then confirm no source-file drift crept in:

```bash
git diff HEAD --name-only | grep -Ev '^(\.github/workflows/ci\.yml)$' | grep -v '^src/_types\.ts$' | grep -v '^src/index\.ts$' | grep -v '^src/parse\.ts$' | grep -v '^src/query\.ts$' | grep -v '^src/utils\.ts$' | grep -v '^test/types\.test-d\.ts$' | grep -v '^tsconfig\.json$' | grep -v '^package\.json$'
```

Expected: no output (empty). If anything prints, you have accidentally modified an out-of-scope
file — revert it before continuing.

### Step 2: Add `typecheck` script to `package.json` (DX-02)

Open `package.json`. Inside the `"scripts"` block (currently lines 23–33 at `f06c800`), insert a
new line for `typecheck`. Place it immediately BEFORE the existing `"test"` line so scripts stay
grouped logically (build/dev before verification scripts) and the diff stays minimal.

New line to add:

```json
    "typecheck": "vitest run --typecheck",
```

After the edit, the scripts block should look like:

```json
  "scripts": {
    "build": "automd && unbuild",
    "automd": "automd",
    "dev": "vitest",
    "lint": "eslint . && prettier -c src test",
    "lint:fix": "eslint --fix . && prettier -w src test",
    "prepack": "pnpm build",
    "release": "pnpm test && changelogen --release && npm publish && git push --follow-tags",
    "typecheck": "vitest run --typecheck",
    "test": "pnpm lint && vitest run --typecheck"
  },
```

Rationale:

- Contributors get a fast type-only verification step (`pnpm typecheck`) that skips the ~200 ms
  eslint pass in `pnpm test`.
- Vitest's `--typecheck` also runs runtime tests unless you pass `--typecheck.only`. That is
  intentional here: the "typecheck" script is meant as "the type layer is enforced", not "only
  types". If a future contributor wants type-only, they can add `--typecheck.only` in a separate
  plan; do NOT do it here — plan 010 owns any further changes to the type-testing config.

**Verify**:

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: exit code 0. Final lines report `Test Files N passed` and `Tests M passed` including the
18 tests from `test/types.test-d.ts`. Runtime tests also pass.

```bash
git diff HEAD -- package.json | head -20
```

Expected: exactly one line added (the `"typecheck": "vitest run --typecheck",` line). No other
lines modified in the scripts block.

### Step 3: Add characterization tests for `parseAuth` (TEST-02)

Append a new `describe` block to `test/parse.test.ts`. Do not modify existing tests. Structure:

```typescript
describe("parseAuth", () => {
  it("splits username and password on the first colon", () => {
    expect(parseAuth("user:pass")).toStrictEqual({
      username: "user",
      password: "pass",
    });
  });

  it("returns an empty password when there is no colon", () => {
    expect(parseAuth("user")).toStrictEqual({
      username: "user",
      password: "",
    });
  });

  it("returns empty username and password for an empty string", () => {
    expect(parseAuth("")).toStrictEqual({
      username: "",
      password: "",
    });
  });

  // FIXME(CORR-03): plan 007 changes this to
  //   { username: "user", password: "pa:ss" }
  // Today parseAuth splits on the FIRST ":" and drops the rest ("ss").
  // See src/parse.ts. When plan 007 lands, update this expected value
  // and remove this FIXME.
  it("currently drops content after the second colon (buggy — see FIXME)", () => {
    expect(parseAuth("user:pa:ss")).toStrictEqual({
      username: "user",
      password: "pa",
    });
  });
});
```

Import guard: verify `parseAuth` is already exported from the barrel `../src` by checking the
existing import at the top of `test/parse.test.ts`. If it is not listed, ADD `parseAuth` to that
existing import — do not add a second import statement. Example:

```typescript
import { parseAuth, parsePath, parseURL, /* ...existing... */ } from "../src";
```

**Verify**:

```bash
pnpm vitest run test/parse.test.ts 2>&1 | tail -10
```

Expected: exit 0, all previously-passing tests still pass, plus 4 new `parseAuth` tests pass.
Final line reports `Tests N passed` where N is the previous count plus 4.

```bash
grep -c 'parseAuth' test/parse.test.ts
```

Expected: `>= 5` (was `0` before this plan — one hit per assertion plus at least one in the
describe block).

```bash
grep -c 'FIXME(CORR-03)' test/parse.test.ts
```

Expected: `1`.

### Step 4: Add characterization tests for IPv6 `parseHost` (TEST-03)

Append another `describe` block to `test/parse.test.ts`. Ensure `parseHost` is on the top import
(add it if missing, same rule as Step 3 — do not create a second import statement).

```typescript
describe("parseHost — IPv6 (characterization)", () => {
  it("parses an IPv4-style host:port control case correctly", () => {
    // Control — proves parseHost works for the non-IPv6 path.
    // If this ever fails, do NOT edit it here — it means a fix in src/parse.ts
    // regressed the non-IPv6 case, which is a separate bug.
    expect(parseHost("example.com:8080")).toStrictEqual({
      hostname: "example.com",
      port: "8080",
    });
  });

  // FIXME(CORR-01): plan 005 changes these to correctly extract the bracketed
  // IPv6 address and (if present) the port after the closing bracket. Today
  // parseHost splits on the first ":", which is inside the address.
  // Expected after plan 005 (for reference — do NOT assert this yet):
  //   parseHost("[::1]:8080")           -> { hostname: "::1", port: "8080" }
  //   parseHost("[::1]")                -> { hostname: "::1" }
  //   parseHost("[2001:db8::1]:443")    -> { hostname: "2001:db8::1", port: "443" }
  // See src/parse.ts. When plan 005 lands, update these expected values and
  // remove the FIXME markers.
  it("currently mangles [::1]:8080 (buggy — see FIXME)", () => {
    expect(parseHost("[::1]:8080")).toStrictEqual({ hostname: "[" });
  });

  it("currently mangles [::1] with no port (buggy — see FIXME)", () => {
    expect(parseHost("[::1]")).toStrictEqual({ hostname: "[" });
  });

  it("currently mangles [2001:db8::1]:443 (buggy — see FIXME)", () => {
    expect(parseHost("[2001:db8::1]:443")).toStrictEqual({ hostname: "[2001" });
  });
});
```

**Important assertion note**: use `toStrictEqual({ hostname: "[" })` — do NOT write
`toStrictEqual({ hostname: "[", port: undefined })`. The actual return object has no `port` key at
all, and `toStrictEqual` distinguishes "missing key" from `port: undefined`. Writing the latter
would fail today. Confirm by running the test after adding it; if it fails with a message about
`port`, you added the wrong shape.

**Verify**:

```bash
pnpm vitest run test/parse.test.ts 2>&1 | tail -10
```

Expected: exit 0, 4 new IPv6 tests pass, previous tests still pass.

```bash
grep -c 'FIXME(CORR-01)' test/parse.test.ts
```

Expected: `1` (the shared FIXME block above the buggy tests; the individual tests reference it via
"see FIXME" comments and do not need to re-emit the marker).

```bash
grep -c 'parseHost.*\[::1\]' test/parse.test.ts
```

Expected: `>= 2`.

### Step 5: Add characterization tests for `withBase` / `withoutBase` with fragments (TEST-06)

Append a new `describe` block to `test/base.test.ts`. Follow the existing `it.each` style used in
that file for consistency. Ensure `withBase` and `withoutBase` are on the top import (they should
already be — verify with `head -5 test/base.test.ts`; if not, add them).

```typescript
describe("withBase — fragment characterization", () => {
  it("keeps query-string handling intact (control)", () => {
    // Control — proves the "already has base" check works for the ?query case.
    // Plan 006 must NOT regress this while fixing the # case.
    expect(withBase("/foo?q=1", "/foo")).toBe("/foo?q=1");
  });

  // FIXME(CORR-02): plan 006 changes this to "/foo#h" (base already present,
  // fragment must not defeat the base-match check). Today the "#" character
  // breaks the base-startsWith comparison and the base is prefixed a second
  // time. See src/utils.ts (withBase).
  it("currently double-prefixes the base when a fragment is present (buggy — see FIXME)", () => {
    expect(withBase("/foo#h", "/foo")).toBe("/foo/foo#h");
  });
});

describe("withoutBase — fragment characterization", () => {
  it("strips base from a path with a query string (control)", () => {
    // Control — plan 006 must NOT regress this while fixing the # case.
    expect(withoutBase("/foo?q=1", "/foo")).toBe("/?q=1");
  });

  // FIXME(CORR-04): plan 006 changes this to "/#h" (base stripped, fragment
  // preserved). Today the "#" defeats the base-match check and the input is
  // returned unchanged. See src/utils.ts (withoutBase).
  it("currently fails to strip base when a fragment is present (buggy — see FIXME)", () => {
    expect(withoutBase("/foo#h", "/foo")).toBe("/foo#h");
  });
});
```

**Verify**:

```bash
pnpm vitest run test/base.test.ts 2>&1 | tail -10
```

Expected: exit 0, 4 new tests pass, previous tests still pass.

```bash
grep -c 'FIXME(CORR-02)' test/base.test.ts
grep -c 'FIXME(CORR-04)' test/base.test.ts
```

Both expected: `1`.

### Step 6: Add runtime tests for query helpers (TEST-01)

Append two new `describe` blocks to `test/query.test.ts` — one for `parseQuery` + `stringifyQuery`
round-trip and one for `encodeQueryItem`. Add `parseQuery`, `stringifyQuery`, and
`encodeQueryItem` to the top import (verify — `getQuery` is already imported; extend that
statement).

```typescript
describe("parseQuery", () => {
  it("returns an empty object for an empty string", () => {
    expect(parseQuery("")).toStrictEqual({});
  });

  it("returns an empty object for a bare '?'", () => {
    expect(parseQuery("?")).toStrictEqual({});
  });

  it("parses a key with no '=' as empty-string value", () => {
    expect(parseQuery("a")).toStrictEqual({ a: "" });
  });

  it("parses 'a=' as empty-string value", () => {
    expect(parseQuery("a=")).toStrictEqual({ a: "" });
  });

  it("parses two empty-valued keys", () => {
    expect(parseQuery("a=&b=")).toStrictEqual({ a: "", b: "" });
  });

  it("collects repeated keys into an array of strings", () => {
    expect(parseQuery("a=1&a=2")).toStrictEqual({ a: ["1", "2"] });
  });

  it("decodes percent-encoded characters", () => {
    expect(parseQuery("a=hello%20world")).toStrictEqual({ a: "hello world" });
  });

  it("decodes '+' as space (application/x-www-form-urlencoded behavior)", () => {
    expect(parseQuery("a=hello+world")).toStrictEqual({ a: "hello world" });
  });
});

describe("stringifyQuery", () => {
  it("returns an empty string for an empty object", () => {
    expect(stringifyQuery({})).toBe("");
  });

  it("encodes spaces as '+'", () => {
    expect(stringifyQuery({ a: 1, b: "x y" })).toBe("a=1&b=x+y");
  });

  it("emits repeated keys for array values", () => {
    expect(stringifyQuery({ a: [1, 2] })).toBe("a=1&a=2");
  });
});

describe("encodeQueryItem", () => {
  it("encodes a scalar value, converting space to '+'", () => {
    expect(encodeQueryItem("k", "v v")).toBe("k=v+v");
  });

  it("emits repeated key=value pairs for an array value", () => {
    expect(encodeQueryItem("k", [1, 2])).toBe("k=1&k=2");
  });

  it("emits a bare key (no '=') for null", () => {
    expect(encodeQueryItem("k", null)).toBe("k");
  });

  it("emits a bare key (no '=') for undefined", () => {
    expect(encodeQueryItem("k", undefined)).toBe("k");
  });
});
```

These are **not** FIXME-marked — they document current, correct-looking behavior. If a future
plan wants to change the null/undefined convention (bare key vs `k=`), it will need to update
these two assertions, but no FIXME lock is needed today.

**Verify**:

```bash
pnpm vitest run test/query.test.ts 2>&1 | tail -10
```

Expected: exit 0, 15 new tests pass, previous `getQuery` tests still pass.

```bash
grep -c 'parseQuery\|stringifyQuery\|encodeQueryItem' test/query.test.ts
```

Expected: `>= 15` (was `0` before this plan).

### Step 7: Full-suite verification

Run the complete verification surface end to end.

```bash
pnpm lint
pnpm typecheck
pnpm test
git status --short
git diff HEAD --stat
```

Expected:

- `pnpm lint` → exit 0. If eslint or prettier complains about any of the new test blocks, run
  `pnpm lint:fix` and re-run `pnpm lint`. If it still fails, STOP (something structural is off).
- `pnpm typecheck` → exit 0. All type tests + runtime tests pass.
- `pnpm test` → exit 0. `Test Files N passed`, `Tests M passed` where M is at least 509 + 4 + 4 + 4
  + 15 = **536** runtime tests (plus 18 type-level tests still passing).
- `git status --short` → shows the in-flight D1 modifications from Step 0 PLUS:
  - `M .github/workflows/ci.yml`
  - `M package.json` (both the D1 mod and this plan's addition — the file was already `M` at
    baseline)
  - `M test/parse.test.ts`
  - `M test/base.test.ts`
  - `M test/query.test.ts`
- `git diff HEAD --stat` → shows those 5 files touched by this plan (`package.json` also had a
  D1 change but is not owned by this plan; only the new `typecheck` line should be in your diff
  block for that file — run `git diff HEAD -- package.json` and confirm only one added line).

If the diff includes any `src/**` file that was not already `M` at baseline, STOP — a source
change slipped in.

## Test plan

New tests, by file:

- `test/parse.test.ts`:
  - `describe("parseAuth", ...)` — 4 cases (happy path, no-colon, empty, buggy multi-colon with FIXME).
  - `describe("parseHost — IPv6 (characterization)", ...)` — 4 cases (control + 3 buggy IPv6, all under one FIXME).
- `test/base.test.ts`:
  - `describe("withBase — fragment characterization", ...)` — 2 cases (control + buggy fragment, FIXME(CORR-02)).
  - `describe("withoutBase — fragment characterization", ...)` — 2 cases (control + buggy fragment, FIXME(CORR-04)).
- `test/query.test.ts`:
  - `describe("parseQuery", ...)` — 8 cases (empty, bare `?`, no-`=`, single `=`, two-empty, array, %20, `+`).
  - `describe("stringifyQuery", ...)` — 3 cases (empty, space→`+`, array).
  - `describe("encodeQueryItem", ...)` — 4 cases (space→`+`, array, null, undefined).

Structural pattern to follow:

- Import from `"../src"`; extend the existing top-of-file import rather than adding a new one.
- Match the surrounding file's `describe`/`it` structure — for `test/base.test.ts`, feel free to
  use `it.each([...])` if the surrounding tests do so, but the 2-case blocks above are small
  enough that four plain `it(...)` calls read fine.
- Use `toStrictEqual` for object returns; `toBe` for string returns.

Final coverage command:

```bash
pnpm vitest run --coverage
```

Expected: exit 0. Coverage for `src/query.ts`, `src/parse.ts`, and `src/utils.ts` should
noticeably tick up (line/branch coverage), especially for the previously-untested `parseAuth`,
`parseQuery`, `stringifyQuery`, `encodeQueryItem` functions and the IPv6 branch of `parseHost`.
Do not hardcode a coverage threshold — the goal is "tests exist", not "coverage passes a bar".

## Done criteria

ALL must hold, machine-checkable:

- [ ] `.github/workflows/ci.yml` line for vitest reads `pnpm vitest run --typecheck --coverage`
      (verify: `grep -c 'vitest run --typecheck --coverage' .github/workflows/ci.yml` → `1`).
- [ ] `package.json` has a `typecheck` script (verify: `grep -c '"typecheck":' package.json` → `1`).
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` exits 0; runtime test count increased by exactly 27 vs baseline (4 parseAuth + 4
      IPv6 parseHost + 2 withBase + 2 withoutBase + 8 parseQuery + 3 stringifyQuery + 4
      encodeQueryItem = 27).
- [ ] `pnpm lint` exits 0.
- [ ] `grep -c 'parseAuth' test/parse.test.ts` → `>= 5` (was `0`).
- [ ] `grep -c 'parseQuery\|stringifyQuery\|encodeQueryItem' test/query.test.ts` → `>= 15` (was `0`).
- [ ] `grep -c 'FIXME(CORR-01)' test/parse.test.ts` → `1`.
- [ ] `grep -c 'FIXME(CORR-02)' test/base.test.ts` → `1`.
- [ ] `grep -c 'FIXME(CORR-03)' test/parse.test.ts` → `1`.
- [ ] `grep -c 'FIXME(CORR-04)' test/base.test.ts` → `1`.
- [ ] `git status --short` shows only the in-scope files changed (plus the pre-existing D1
      in-flight modifications, unchanged from Step 0 baseline).
- [ ] No file under `src/**` appears in `git diff HEAD --name-only` (other than what was already
      `M` at Step 0 baseline).
- [ ] `advisor-plans/README.md` status row updated if the file exists; otherwise skip (the
      advisor maintains that index).

## STOP conditions

Stop and report back (do not improvise) if any of these occur:

- **Baseline drift**: `git status --short` at Step 0 does NOT show all of
  `M src/_types.ts` (as `??`), `M src/{index,parse,query,utils}.ts`, `M test/types.test-d.ts`,
  `M tsconfig.json`, `M package.json`. Either the in-flight work is missing, or someone committed
  it — either way this plan's baseline assumptions are invalidated.
- **Baseline broken**: `pnpm test` fails at Step 0 (before any edits). The plan cannot proceed
  from a red baseline.
- **Reality doesn't match a characterization value**: If any of the "current behavior" values in
  the Current state section is wrong when you run the test, e.g. `parseAuth("user:pa:ss")` returns
  `{ username: "user", password: "pa:ss" }` (the correct 3-part behavior) instead of the buggy
  `{ username: "user", password: "pa" }`, then a fix has landed independently and this plan needs
  revision. Do not "fix" the assertion silently — stop and report which assertion(s) diverged.
- **Src drift**: You find yourself needing to edit any file under `src/**`, `tsconfig.json`, or
  `test/types.test-d.ts` to make a test pass. That means the plan expanded; stop.
- **Lint won't pass on new tests**: After `pnpm lint:fix`, lint still fails on your additions.
  Something structural about the imports or test style is wrong; stop and report the eslint
  message.
- **CI file has additional structure**: If `.github/workflows/ci.yml` has been rewritten since
  `f06c800` (e.g., matrix strategies added, the vitest line moved to a different job), stop —
  plan 003 or a follow-up may already own CI restructuring.
- **The `typecheck` script name is already taken**: Very unlikely (verified absent at `f06c800`),
  but if a `typecheck` script already exists in `package.json` when you reach Step 2, stop — plan
  010 or another plan may have landed it first with different semantics.

## Maintenance notes

For whoever owns this test surface after this plan lands:

- The `FIXME(CORR-NN)` markers are the handoff contract. Plans 005, 006, 007 will find these by
  grep and flip the assertions. Do NOT remove the markers early — they're a lock, not a comment.
- If a future contributor adds a new test that exercises `parseAuth`, `parseHost`,
  `withBase`/`withoutBase`, or the query helpers, they should co-locate it with the existing
  `describe` blocks added by this plan, not create yet another file.
- If plan 005/006/007 lands but the FIXME assertions are not updated in the same commit, that PR
  is incomplete — a reviewer should block it. The commit that fixes the bug must also flip the
  characterization assertion and remove the FIXME.
- Coverage: the runtime-coverage gap for `parseQuery` / `stringifyQuery` / `encodeQueryItem` is
  closed by this plan but only with the smoke cases listed above. A future test-expansion plan may
  want to add fuzz/property tests; explicitly deferred out of this plan to keep risk LOW.
- Node matrix: this plan does not add a Node version matrix. If a future plan adds one, remember
  that the `pnpm vitest run --typecheck` invocation should stay identical across matrix cells —
  do not conditionalize `--typecheck` per Node version.
- Reviewer focus for the resulting PR: (1) confirm no `src/**` file appears in the diff,
  (2) confirm each buggy-case assertion has a FIXME marker with the correct plan number,
  (3) confirm the CI diff is exactly one line, (4) confirm the runtime test count rose by exactly
  27.
