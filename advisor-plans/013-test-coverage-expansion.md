# Plan 013: Expand test coverage for `$URL`, WPT fixture, query combinators, and type surfaces

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f06c800..HEAD -- test/url.test.ts test/query.test.ts test/types.test-d.ts test/punycode.test.ts test/fixture/urltestdata.json src/url.ts src/parse.ts src/utils.ts`
> If any file listed above changed since this plan was written, compare the "Current state"
> excerpts in each stage against the live code before proceeding; on any material mismatch treat
> it as a STOP condition (see Stage-specific STOPs below).
>
> **Working-tree preservation**: at plan time the repo has uncommitted in-flight type-safety work
> (`src/_types.ts`, refined overloads in `src/{index,parse,query,utils}.ts`, expansion in
> `test/types.test-d.ts`). It ships as a separate v1.7 release (direction plan D1). **Do not commit
> the in-flight work as part of executing this plan.** Stage this plan's test additions on top of
> whatever is currently on disk and commit only those additions per stage. If your commit accidentally
> stages `src/_types.ts` or any `src/**` file, `git reset HEAD -- src/` and re-stage tests only.

## Status

- **Priority**: P2
- **Effort**: M (4 stages: S + M + S + S)
- **Risk**: LOW (tests only; no source changes)
- **Depends on**: `advisor-plans/001-verification-baseline.md` — Stage 4 requires the
  `vitest run --typecheck` CI gate to be live so type-tests actually run in CI.
- **Category**: tests
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`unjs/ufo@1.6.4` is a widely-adopted, zero-dependency URL utility. The audit found four surfaces
with **no test intent at all** (not just missing edge cases): `$URL` setter/mutation paths, the
committed-but-unused WPT `urltestdata.json` corpus, `filterQuery`/`withQuery` combinator behavior,
and type-level signatures for ~11 functions. Silent regressions on any of these will land
undetected. This plan installs a guardrail suite — the same 509 tests will grow by roughly 60–100
new assertions, and the WPT wire creates a **ratchet**: as future correctness plans (004, 005, 007)
land, `test.fails` entries flip green and force the skip list to shrink. That is the mechanism this
plan is really adding to the repo.

## Current state

### Repository facts

- Package: `unjs/ufo@1.6.4`, universal URL utility, zero deps, MIT.
- Baseline SHA: `f06c800` (2026-07-01). Branch: `advisor/013-test-coverage-expansion`.
- Test runner: `vitest` with `--typecheck` gate.
- Test files (all under `test/`): `base`, `double-slash`, `encoding`, `is-same`, `join`,
  `normalize`, `parse`, `punycode`, `query`, `resolve`, `trailing-slash`, `url`, `utilities`
  (all `.test.ts`), plus `types.test-d.ts` for type-level assertions.
- Fixtures at `test/fixture/`:
  - `urltestdata.json` — WPT URL parsing corpus, **committed but unwired**.
  - `toascii.json` — WPT ToASCII corpus, wired via `test/punycode.test.ts`.
- Convention: **conventional commits** (see `git log --oneline -20`), one commit per stage.
- Test cadence at baseline: 509 tests green (`pnpm test`).

### Stage 1 — `test/url.test.ts` (existing, 5–33)

Currently ONE fixture URL, single `toMatchObject` snapshot of getters. No setter/mutation tests.
Excerpt (verify unchanged before starting Stage 1):

```ts
// test/url.test.ts:5-33
describe("$URL", () => {
  test("getters", () => {
    const inputURL
      = "https://john:doe@example.com:1080/path?query=value&v=1&v=2#hash";
    const url = new $URL(inputURL);

    expect(url.href).toEqual(inputURL);
    expect(url.toString()).toEqual(url.href);
    expect(url.toJSON()).toEqual(url.href);
    // ...toMatchObject with protocol/host/auth/pathname/hash/hostname/port/username/password/...
  });
  test("append", () => { /* ... */ });
  test("throws error if appending with another url with protocol", () => { /* ... */ });
  describe("constructor errors", () => { /* ... */ });
});
```

`$URL` class shape (from `src/url.ts`):

- **Public fields (settable via plain assignment)**: `protocol`, `host`, `auth`, `pathname`,
  `query` (a `QueryObject`), `hash`.
- **Getter-only (no setters)**: `hostname`, `port`, `username`, `password`, `search`,
  `searchParams`, `origin`, `fullpath`, `encodedAuth`, `href`, `hasProtocol`, `isAbsolute`.
- **Factory**: `createURL(input: string): $URL` → returns `new $URL(input)`.

> **Important shape correction — read before writing Stage 1 tests**: `$URL` has **no ES setters**
> for `hostname`/`port`/`username`/`password`/`search`/`hash`-via-setter etc. `hash` IS a public
> field, so `url.hash = "#x"` works. But `url.hostname = "..."` in non-strict JS silently no-ops
> (or throws `TypeError` under `"use strict"`). This is expected: `$URL` is `@deprecated` and
> "the setter API is missing" IS the characterization we want to pin. Test **what works**
> (field-assignment on `protocol`/`host`/`auth`/`pathname`/`hash`/`query`) and **explicitly document
> the getter-only surface** with a `test` block that asserts the property descriptor has no `set`.
> Do not "fix" the class by adding setters — that is out of scope (see plan D5 in
> `advisor-plans/README.md`'s Batch-2 backlog).

### Stage 2 — `test/wpt-urltestdata.test.ts` (new)

- Fixture already committed at `test/fixture/urltestdata.json` (~7433 lines, ~700 cases). First
  entry is a comment string; entries can also be a bare comment string (skip those).
- Precedent for loading a WPT JSON fixture: `test/punycode.test.ts`:

```ts
// test/punycode.test.ts (full file, 15 lines)
import { describe, expect, test } from "vitest";
import { toASCII } from "../src/punycode";
import toAsciiTests from "./fixture/toascii.json";

const ignoredTests = new Set(["a­b", "a%C2%ADb"]);

describe("punycode (toASCII)", () => {
  const tests = toAsciiTests
    .splice(1)
    .filter(t => t.output && !ignoredTests.has(t.input));

  for (const t of tests) {
    test(t.input + (t.comment ? `: ${t.comment}` : ""), () => {
      expect(toASCII(t.input)).toBe(t.output);
    });
  }
});
```

Shape of `urltestdata.json` entries (verify with `head -50 test/fixture/urltestdata.json`):

```json
{
  "input": "http://user:pass@foo:21/bar;par?b#c",
  "base": "http://example.org/foo/bar",
  "href": "http://user:pass@foo:21/bar;par?b#c",
  "protocol": "http:",
  "username": "user",
  "password": "pass",
  "host": "foo:21",
  "hostname": "foo",
  "port": "21",
  "pathname": "/bar;par",
  "search": "?b",
  "hash": "#c"
}
```

Some entries are bare strings (comments) — filter out with `typeof e === "object"`. Some entries
have `"failure": true` — WPT expects `new URL(input, base)` to throw. Filter those out for now
(we're testing successful parse only).

### Stage 3 — `test/query.test.ts` (existing)

Existing suite covers `withQuery` (broad literal cases), `filterQuery` (3 cases with a single
`(key) => key !== "bar"` predicate), and `getQuery`. No combinator/composition tests. Excerpt of
current `filterQuery` block:

```ts
// test/query.test.ts (filterQuery describe block)
describe("filterQuery", () => {
  const tests = [
    { input: "/foo", out: "/foo" },
    { input: "/foo?bar=1", out: "/foo" },
    { input: "/foo?bar=1&baz=2", out: "/foo?baz=2" },
  ];
  const predicate = (key: string) => key !== "bar";
  for (const t of tests) {
    test(`${t.input.toString()} filter "bar"`, () => {
      expect(filterQuery(t.input, predicate)).toBe(t.out);
    });
  }
});
```

Signatures (from `src/utils.ts`):

```ts
// utils.ts:401-407 (withQuery)
export function withQuery<
  const Input extends string,
  const Q extends QueryObject,
>(input: Input, query: Q): WithQueryResult<Input, Q>;
export function withQuery(input: string, query: QueryObject): string;

// utils.ts:424-427 (filterQuery)
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string;
```

> **Predicate signature note**: `filterQuery`'s predicate takes `(key, value)` where `value` is
> `string | string[]` (array when the query had repeats, string otherwise). The plan-narrative's
> `(_, v) => v !== null` example is misleading — `null` never appears in the value channel; empty
> string does. Adjust the test to `(_, v) => v !== ""` and add a separate probe for how repeated
> keys arrive.

### Stage 4 — `test/types.test-d.ts` (existing, 18 tests)

Uses `expectTypeOf` from vitest. Pattern to mirror (dynamic-string via `declare const dyn: string`,
then two assertions per function — literal input → refined type, `dyn` input → base type):

```ts
// test/types.test-d.ts:31-33 (example)
declare const dyn: string;

// literal case
expectTypeOf(withLeadingSlash("foo")).toEqualTypeOf<"/foo">();
// dynamic case
expectTypeOf(withLeadingSlash(dyn)).toEqualTypeOf<string>();
```

Functions currently covered (do NOT re-cover): `getQuery`, `parseQuery`, `stringifyQuery`,
`encodeQueryItem`, `withQuery`, `withLeadingSlash`, `withoutLeadingSlash`, `withTrailingSlash`,
`withoutTrailingSlash`, `hasLeadingSlash`, `hasTrailingSlash`, `isRelative`, `withHttp`, `withHttps`,
`withProtocol`, `withoutProtocol`, `withFragment`, `withoutFragment`, `withoutHost`, `parseURL`,
`parsePath`, `parseFilename`, `joinURL`.

Functions to ADD in this plan (11): `parseHost`, `parseAuth`, `withBase`, `withoutBase`,
`filterQuery`, `stringifyParsedURL`, `resolveURL`, `normalizeURL`, `joinRelativeURL`, `isEqual`,
`isSamePath`. Import from `../src`.

Locations of these functions' current runtime signatures (for the executor to read):

- `src/parse.ts:147` — `parseAuth(input = ""): ParsedAuth`
- `src/parse.ts:171` — `parseHost(input = ""): ParsedHost`
- `src/parse.ts:196` — `stringifyParsedURL(parsed: Partial<ParsedURL>): string`
- `src/utils.ts:343` — `withBase(input: string, base: string)`
- `src/utils.ts:371` — `withoutBase(input: string, base: string)`
- `src/utils.ts:424` — `filterQuery(input, predicate): string`
- `src/utils.ts:519` — `joinRelativeURL(..._input: string[]): string`
- `src/utils.ts:677` — `normalizeURL(input: string): string`
- `src/utils.ts:698` — `resolveURL(base = "", ...inputs: string[]): string`
- `src/utils.ts:755` — `isSamePath(p1: string, p2: string)`
- `src/utils.ts:787` — `isEqual(a: string, b: string, options: CompareURLOptions = {})`

## Commands you will need

| Purpose               | Command                                     | Expected on success                              |
| --------------------- | ------------------------------------------- | ------------------------------------------------ |
| Install               | `pnpm install`                              | exit 0                                           |
| Lint                  | `pnpm lint`                                 | exit 0                                           |
| Full test (lint+type) | `pnpm test`                                 | exit 0, 509 + N new tests pass                   |
| Vitest only           | `pnpm vitest run`                           | exit 0                                           |
| Vitest + typecheck    | `pnpm vitest run --typecheck`               | exit 0                                           |
| Single-file test      | `pnpm vitest run test/url.test.ts`          | exit 0                                           |
| Build                 | `pnpm build`                                | exit 0 (README `automd` regen is expected)       |
| Show baseline count   | `pnpm vitest run 2>&1 \| grep "Tests"`      | `Tests  509 passed`                              |

Snapshot the baseline test count before Stage 1 and after each stage; the number MUST monotonically
increase.

## Suggested executor toolkit

- Skill `vitest` (`~/.pi/agent/skills/vitest/SKILL.md`) — for `describe`/`test`/`expect` patterns
  and typecheck flag details.
- Skill `codebase-design` — only if you find yourself wanting to add helpers outside of
  `test/`; do not.

## Scope

**In scope** (the ONLY files you may modify):

- `test/url.test.ts` (Stage 1)
- `test/wpt-urltestdata.test.ts` (Stage 2 — new file)
- `test/wpt-skip-list.ts` (Stage 2 — new file, optional; inline in the test file if trivially
  small)
- `test/query.test.ts` (Stage 3)
- `test/types.test-d.ts` (Stage 4)
- `advisor-plans/README.md` (status-row update at the very end)

**Out of scope** (do NOT touch, even if a test motivates it):

- `src/**` — this plan adds **zero** source changes. If a test fails because the source is buggy,
  pin the current behavior with `test.fails(...)` (Stage 2) or an inline `FIXME:` comment
  referencing the owning plan (Stage 3). Do not fix source.
- `test/fixture/**` — the `urltestdata.json` corpus is committed as-is. Do not add or modify
  fixtures.
- `test/types.test-d.ts` **refinement expectations** — Stage 4 pins BASELINE types only. Refined
  return types from the in-flight `src/_types.ts` are the correct baseline where the file already
  refines; but adding new refinement assertions is plan D1's job, not this plan's.
- IPv6-specific `$URL` and `parseHost` coverage — owned by plan 005.
- `parseAuth` / base-fragment behavior tests — owned by plans 001, 006, 007.

## Git workflow

- Branch: `advisor/013-test-coverage-expansion`
  - Create with: `git checkout -b advisor/013-test-coverage-expansion` (from the current
    HEAD; do NOT create from `f06c800` — the in-flight working-tree changes must ride along).
- **One commit per stage.** Four commits total.
- Commit message style: conventional commits, matching `git log --oneline -20`. Examples:
  - Stage 1: `test($URL): add setter/mutation and createURL parity suite`
  - Stage 2: `test(wpt): wire urltestdata.json subset with skip-list ratchet`
  - Stage 3: `test(query): cover filterQuery + withQuery combinators`
  - Stage 4: `test(types): pin baseline type-tests for 11 additional exports`
- **Do NOT push or open a PR.** Local commits only; the maintainer publishes.
- Before each commit: `git status` — confirm ONLY files in the in-scope list are staged. If
  `src/**` is staged, `git reset HEAD -- src/` before committing.

## Steps

Each step is one stage = one commit. Run the drift check and Stage-specific STOP checks first.

### Step 0: Preflight

1. `git rev-parse HEAD` — record the current HEAD SHA (this is the branch-point).
2. `git status --short` — confirm the in-flight uncommitted work is present. You should see modified
   `src/{_types.ts,index.ts,parse.ts,query.ts,utils.ts}` and `test/types.test-d.ts` and possibly
   others. Do NOT stage or discard any of it.
3. `pnpm install` → exit 0.
4. `pnpm test` → exit 0, exactly `509 passed`. Record the exact number.
5. `git checkout -b advisor/013-test-coverage-expansion` from HEAD.

**STOP if**: `pnpm test` fails at preflight (not our problem; the in-flight work is broken → report
back).

### Step 1 (Stage 1): `$URL` setter / mutation / createURL suite

Read `test/url.test.ts` and `src/url.ts` in full first. Confirm the "Current state" excerpts match.

Append (do not replace) new `describe` blocks to `test/url.test.ts`. Import `createURL` alongside
`$URL`:

```ts
import { $URL, createURL } from "../src";
```

Add the following blocks:

1. **`describe("$URL — public-field mutation")`** — for each of `protocol`, `host`, `auth`,
   `pathname`, `hash`, and `query`, a `test` that:
   - constructs from `"https://john:doe@example.com:1080/path?query=value#hash"`,
   - reassigns the field,
   - asserts `.href` reflects the change,
   - asserts `.toString() === .href` and `.toJSON() === .href` still hold.
   - Sample shape (executor: mirror this exactly, one test per field):
     ```ts
     test("protocol reassignment updates href", () => {
       const url = new $URL("https://example.com/x");
       url.protocol = "http:";
       expect(url.href).toBe("http://example.com/x");
     });
     ```
   - For `query`, mutate via `url.query.newKey = "1"` AND `url.query = { only: "one" }`; both must
     be reflected in `.search` and `.href`.

2. **`describe("$URL — getter-only surface")`** — one `test` per getter-only property
   (`hostname`, `port`, `username`, `password`, `search`, `searchParams`, `origin`, `fullpath`,
   `encodedAuth`, `href`, `hasProtocol`, `isAbsolute`) that asserts the property descriptor has no
   setter:
   ```ts
   test("hostname is getter-only", () => {
     const desc
       = Object.getOwnPropertyDescriptor($URL.prototype, "hostname")
         ?? Object.getOwnPropertyDescriptor(new $URL("https://a.com"), "hostname");
     expect(desc?.set).toBeUndefined();
     expect(typeof desc?.get).toBe("function");
   });
   ```
   This is **characterization**, not aspiration: we are pinning "no setter" so a future PR that
   adds one deliberately updates this test.

3. **`describe("createURL parity")`** — for each input in this list, assert
   `createURL(input).href === new $URL(input).href` and both produce the same `toMatchObject`
   snapshot of `{ protocol, host, pathname, hash }`:
   - `""` (empty)
   - `"/"` (root only)
   - `"https://example.com"` (missing path)
   - `"https://user:pass@example.com:8080/a?b=1#c"` (full)
   - `"//example.com/path"` (protocol-relative)
   - `"mailto:a@b.com"` (opaque scheme — do NOT deep-assert; just `href === href`)

4. **`describe("$URL — edge case constructors")`** — three tests:
   - `new $URL("")` — `.href === ""`, `.protocol === ""`, `.host === ""`, `.pathname === ""`.
   - `new $URL("/only-path")` — `.protocol === ""`, `.host === ""`, `.pathname === "/only-path"`,
     `.hasProtocol === 0`, `.isAbsolute` truthy (leading `/`).
   - `new $URL("https://example.com")` — `.pathname === ""` (verify empirically; if actual value
     is `""`, pin that; if `/`, pin that). Do a probe run FIRST if unsure.

**IPv6 note**: the plan narrative mentions "IPv6 (if plan 005 landed)". Check with
`grep -n "^005" advisor-plans/README.md`. If plan 005's status is **DONE**, add one test:
`new $URL("http://[::1]:8080/x").hostname === "[::1]"` and `.port === "8080"`. If plan 005 is
**TODO** or **IN PROGRESS**, **skip the IPv6 test** — do not preemptively assert a fixed shape;
that's plan 005's job.

**Verify**:

```
pnpm vitest run test/url.test.ts
```

→ all pre-existing `$URL` tests still pass, plus at least ~20 new tests (exact count depends on how
many getter-only assertions you split). No `.only` or `.skip` in the new block.

**Then**:

```
pnpm test
```

→ exit 0, count = `509 + N_stage1`.

**Commit**: `test($URL): add setter/mutation and createURL parity suite`
Stage only `test/url.test.ts`:

```
git add test/url.test.ts
git status  # confirm nothing under src/ is staged
git commit -m "test(\$URL): add setter/mutation and createURL parity suite"
```

**STOP conditions for Stage 1**:

- `test/url.test.ts` differs materially from the excerpt in "Current state" → the file has been
  rewritten since `f06c800`; re-baseline and report.
- `pnpm test` count decreases (i.e. an existing test breaks). Do NOT "fix" the source. Report.
- A public field turns out to have a setter, or a "getter-only" property turns out to have a
  setter. Update the assertion to reflect reality and note it in the commit message. This is
  characterization; the goal is truth, not the plan's assumption.

### Step 2 (Stage 2): Wire WPT `urltestdata.json` subset

Read `test/punycode.test.ts` and `head -60 test/fixture/urltestdata.json` first. Confirm the shape.

Create `test/wpt-urltestdata.test.ts` (new file). Skeleton:

```ts
import { describe, expect, test } from "vitest";
import { parseURL, stringifyParsedURL } from "../src";
import rawCases from "./fixture/urltestdata.json";

interface WptCase {
  input: string;
  base?: string | null;
  failure?: boolean;
  href?: string;
  protocol?: string;
  host?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
}

// Comments in the fixture are bare strings — drop them.
const allCases: WptCase[] = (rawCases as unknown[]).filter(
  (c): c is WptCase => typeof c === "object" && c !== null && "input" in c,
);

// Special-scheme subset: WHATWG "special" schemes (http, https, ws, wss, ftp, file).
const SPECIAL_PREFIXES = ["http:", "https:", "ws:", "wss:", "ftp:", "file:"];
const specialCases = allCases.filter(
  c =>
    !c.failure
    && typeof c.input === "string"
    && SPECIAL_PREFIXES.some(p => c.input.toLowerCase().startsWith(p)),
);

// Bail limit: keep the initial wire small; expand incrementally.
const INITIAL_LIMIT = 100;
const subset = specialCases.slice(0, INITIAL_LIMIT);

// Known-divergent inputs (skip-list). Grows with observed failures; SHRINKS as fixes land.
// One entry per line so future PRs can trivially git-blame each divergence.
const SKIP_LIST: ReadonlySet<string> = new Set<string>([
  // Add entries after the first `pnpm vitest run test/wpt-urltestdata.test.ts`.
  // Example: "http://example\t.\norg",
]);
```

Then iterate. Compare `parseURL(c.input, c.base ?? undefined)` fields to WPT `c.protocol`,
`c.host`, `c.pathname`, `c.search`, `c.hash` — **only fields the WPT entry defines** (skip
undefined ones). Do NOT compare `c.href` directly (ufo's `stringifyParsedURL` output format may
diverge from WHATWG normalization on trailing `/`, empty-search stripping, etc.); assert
per-field instead.

```ts
describe("WPT urltestdata.json (special-scheme subset)", () => {
  for (const c of subset) {
    const label = `${c.input}${c.base ? ` (base: ${c.base})` : ""}`;

    if (SKIP_LIST.has(c.input)) {
      test.skip(`${label} [known divergence — skipped]`, () => {});
      continue;
    }

    // Cases known to fail today — mark test.fails so a future fix trips them.
    // Populate this after the first run (see procedure below).
    const EXPECTED_FAILURES: ReadonlySet<string> = new Set<string>([
      // e.g. "http://example\t.\norg",
    ]);

    const fn = EXPECTED_FAILURES.has(c.input) ? test.fails : test;
    fn(label, () => {
      const parsed = parseURL(c.input, c.base ?? undefined);
      if (c.protocol !== undefined)
        expect(parsed.protocol).toBe(c.protocol);
      if (c.host !== undefined)
        expect(parsed.host).toBe(c.host);
      if (c.pathname !== undefined)
        expect(parsed.pathname).toBe(c.pathname);
      if (c.search !== undefined)
        expect(parsed.search).toBe(c.search);
      if (c.hash !== undefined)
        expect(parsed.hash).toBe(c.hash);
    });
  }
});
```

**Procedure** (do this exactly):

1. Write the skeleton above with `SKIP_LIST` and `EXPECTED_FAILURES` empty.
2. Run `pnpm vitest run test/wpt-urltestdata.test.ts 2>&1 | tee /tmp/wpt-stage2-run1.log`.
3. Parse the failing cases from the log. For each failure, move the exact `c.input` string into
   `EXPECTED_FAILURES`.
4. Re-run: `pnpm vitest run test/wpt-urltestdata.test.ts`. Now:
   - Cases in `EXPECTED_FAILURES` PASS (because `test.fails` inverts the expectation).
   - Any that still FAIL are cases where `parseURL` **threw** rather than returning a wrong-shape
     object. Move those into `SKIP_LIST` (they need `test.skip`, not `test.fails`).
5. Re-run until green.
6. Count entries: `EXPECTED_FAILURES.size + SKIP_LIST.size`.
   - **If total > 200 → STOP** (see STOP conditions). The WPT corpus is bigger than initial subset
     intent; reduce `INITIAL_LIMIT` to 50 and repeat, or scope down `SPECIAL_PREFIXES` to just
     `["http:", "https:"]`. Do not silently expand the skip list past 200.
7. Add a comment at the top of the file:
   ```ts
   // WPT wire: <total>-case subset of ~<total-special> special-scheme cases in urltestdata.json.
   // <n> currently divergent (test.fails), <m> currently skipped (test.skip).
   // As fixes land (plans 004/005/007), test.fails entries flip to green and trip the ratchet —
   // move the input out of EXPECTED_FAILURES and confirm it passes as a plain `test`.
   ```

**Optional**: if `EXPECTED_FAILURES` + `SKIP_LIST` exceeds ~30 entries, factor them into
`test/wpt-skip-list.ts` (new file) exporting two `Set<string>`s. Otherwise keep them inline.

**Verify**:

```
pnpm vitest run test/wpt-urltestdata.test.ts
```

→ exit 0, all subset tests pass (some via `test.fails` inversion).

```
pnpm test
```

→ exit 0, count = `(509 + N_stage1) + N_stage2`.

**Commit**: `test(wpt): wire urltestdata.json subset with skip-list ratchet`
Stage: `test/wpt-urltestdata.test.ts` and (if you created it) `test/wpt-skip-list.ts` only.

**STOP conditions for Stage 2**:

- Total of `EXPECTED_FAILURES.size + SKIP_LIST.size` exceeds **200** after populating from a
  passing run. Report the total and stop. Do not commit a skip list that big.
- `parseURL` signature does not accept a `base` argument (i.e. the function is `parseURL(input:
  string): ParsedURL` with no base). In that case, drop `base` from the call and add a comment
  that base-relative WPT cases will need plan 006 before they can be wired. Skip any case with
  `c.base` set. Note this in the commit message.
- Vitest complains that `test.fails.each` / `test.fails` is not available in the installed
  version — use a plain `test` that inverts with `.not` and note the version mismatch. Do not
  upgrade vitest.

### Step 3 (Stage 3): `filterQuery` + `withQuery` combinator coverage

Read `test/query.test.ts` and `src/utils.ts:395-445` (the `withQuery` + `filterQuery` block) first.

Append (do not replace) a new `describe` block to `test/query.test.ts`. Import `filterQuery` and
`withQuery` — already imported. Add:

1. **`describe("filterQuery — extended")`** — new predicate cases:
   - `filterQuery("/x?utm_source=a&keep=1", (k) => k !== "utm_source")` → `"/x?keep=1"`.
   - `filterQuery("/x?a=&b=1", (_, v) => v !== "")` → `"/x?b=1"`. (Rationale: the plan-narrative's
     `v !== null` is wrong — `filterQuery`'s value channel is `string | string[]`, never `null`.
     Empty string is the "empty value" case.)
   - `filterQuery("", () => true)` → `""` (empty input round-trip).
   - `filterQuery("/x", () => true)` → `"/x"` (no `?` → early return path; see `utils.ts:428-430`).

2. **`describe("filterQuery + withQuery — chained")`**:
   - `withQuery(filterQuery("/x?keep=1&drop=2", (k) => k !== "drop"), { added: "1" })` →
     `"/x?keep=1&added=1"`.
   - Round-trip on encoding: start with `"/x?email=a%40b.com&drop=1"`, filter drop, then re-add
     via `withQuery`. Assert the `email` value survives (verify current encoding behavior via probe
     first; pin the actual output).

3. **`describe("filterQuery — array-value predicate")`** — this is a **probe**, not an
   aspirational test. Run a probe first:
   ```
   node -e 'import("./src/index.ts").then(m => console.log(m.filterQuery("?a=1&a=2", (k,v) => v !== "1")))'
   ```
   (or via a tiny scratch script under `pnpm exec tsx`). Record the exact actual output. Then pin
   that as the expected value in the test, with a comment:
   ```ts
   // Probe on f06c800: filterQuery(?a=1&a=2, (k,v) => v !== "1") → "<actual>".
   // FIXME: value channel for repeated keys is `string[]`; the predicate receives ["1","2"],
   // so `v !== "1"` is always true → filter keeps both. See plan 009 CORR-05 for related bug.
   // Pinning current behavior for characterization; refinement lands in plan 009.
   ```
   The test asserts `<actual>`, whatever it is. This is a characterization test; it will change
   only when plan 009 lands.

4. **`describe("withQuery — noop and idempotence")`**:
   - `withQuery("/x", {})` → `"/x"` (empty-object noop).
   - `withQuery(withQuery("/x", { a: "1" }), {})` === `withQuery("/x", { a: "1" })` (idempotent).
   - `withQuery("/x?a=1", { a: "1" })` → `"/x?a=1"` (same-value reassign; verify current
     stringification with a probe if the trailing form is uncertain).

**Verify**:

```
pnpm vitest run test/query.test.ts
```

→ exit 0, all pre-existing query tests still pass, plus at least ~10 new tests.

```
pnpm test
```

→ exit 0, count = `(509 + N_stage1 + N_stage2) + N_stage3`.

**Commit**: `test(query): cover filterQuery + withQuery combinators`
Stage: `test/query.test.ts` only.

**STOP conditions for Stage 3**:

- The probe in item 3 throws or returns `undefined`. That's a real bug, not a "characterize
  current behavior" case. Skip that specific test with `test.skip("probe: throws — deferred to
  plan 009")` and continue.
- A pre-existing query test breaks. Do not "fix" the source; report.

### Step 4 (Stage 4): Type-tests for 11 additional exports

Read `test/types.test-d.ts` in full first. Match the existing style exactly: `describe` per
functional group, `expectTypeOf` from `vitest`, one test per function with a literal-input case and
a `dyn`-input case.

Extend the imports at the top of the file:

```ts
import {
  filterQuery,
  isEqual,
  isSamePath,
  joinRelativeURL,
  normalizeURL,
  parseAuth,
  // ...existing imports...
  parseHost,
  resolveURL,
  stringifyParsedURL,
  withBase,
  withoutBase,
} from "../src";
```

Add these `describe` blocks at the end of the file:

1. **`describe("parse extras — baseline")`** — three tests:
   - `parseHost("example.com:8080")` → literal input, assert return type matches the current
     `ReturnType<typeof parseHost>` shape:
     ```ts
     expectTypeOf(parseHost("example.com:8080")).toEqualTypeOf<
       ReturnType<typeof parseHost>
     >();
     expectTypeOf(parseHost(dyn)).toEqualTypeOf<ReturnType<typeof parseHost>>();
     ```
   - Same shape for `parseAuth("user:pass")`.
   - Same shape for `stringifyParsedURL({ pathname: "/x" })` — result should be `string`:
     ```ts
     expectTypeOf(stringifyParsedURL({ pathname: "/x" })).toEqualTypeOf<string>();
     ```
   > **Baseline-only policy**: use `ReturnType<typeof f>` rather than hand-typing the struct, so
   > this test does not lock in a specific interface name. The in-flight `_types.ts` may have
   > already refined some of these; if `expectTypeOf(parseHost("example.com:8080")).toEqualTypeOf<{
   > hostname: "example.com"; port: "8080" }>()` compiles, that IS the refined baseline — use it.
   > If it does not compile, fall back to `ReturnType<typeof parseHost>`. See STOP condition for
   > Stage 4.

2. **`describe("base transforms — baseline")`** — four tests:
   - `withBase("/foo", "/api")` → literal, assert type is `string` (no refinement expected).
   - `withBase(dyn, dyn)` → `string`.
   - `withoutBase("/api/foo", "/api")` → `string`.
   - `withoutBase(dyn, dyn)` → `string`.

3. **`describe("filterQuery — baseline")`** — two tests:
   - `filterQuery("/x?a=1", (k) => k !== "a")` → `string`.
   - `filterQuery(dyn, (k) => true)` → `string`.

4. **`describe("resolve / normalize / joinRelative — baseline")`** — six tests:
   - `resolveURL("/a", "b")` → `string`.
   - `resolveURL(dyn, dyn)` → `string`.
   - `normalizeURL("http://a.com/x")` → `string`.
   - `normalizeURL(dyn)` → `string`.
   - `joinRelativeURL("a", "b", "c")` → `string`.
   - `joinRelativeURL(dyn, dyn)` → `string`.

5. **`describe("equality predicates — baseline")`** — four tests:
   - `isEqual("/a", "/a")` → `boolean`.
   - `isEqual(dyn, dyn)` → `boolean`.
   - `isSamePath("/a", "/a")` → `boolean`.
   - `isSamePath(dyn, dyn)` → `boolean`.

Total new assertions: ~19 (each `expectTypeOf` counts). At the `describe`-level, 5 new blocks.

**Verify**:

```
pnpm vitest run test/types.test-d.ts --typecheck
```

→ exit 0, existing 18 type-tests still pass, plus the 5 new describes.

```
pnpm test
```

→ exit 0. This runs `pnpm lint && vitest run --typecheck`. Both must pass. Count = final total.

**Commit**: `test(types): pin baseline type-tests for 11 additional exports`
Stage: `test/types.test-d.ts` only.

**STOP conditions for Stage 4**:

- A `toEqualTypeOf<string>()` assertion fails because the in-flight `_types.ts` has already
  refined the return to a narrower literal type. That refined type IS the correct baseline for
  this plan. Change the assertion to match the actual refined type (use TypeScript's error message
  as the source of truth). Note it in the commit body: `types(<fn>): baseline is <refined-type>
  per in-flight _types.ts`.
- `pnpm test` fails with a lint error inside `test/types.test-d.ts`. Fix the lint (imports order,
  unused vars) but do NOT change any `expectTypeOf` assertion to make lint happy.
- The `--typecheck` gate is not present in `pnpm test` (i.e. plan 001 has not landed yet). In that
  case, run `pnpm vitest run --typecheck` manually and commit anyway with a note in the commit
  body: `NOTE: --typecheck gate not yet in \`pnpm test\`; ran manually. Depends on plan 001.`

### Step 5: Update `advisor-plans/README.md`

Locate the status row for plan 013 in the execution table. If the row exists, change its `Status`
column to **DONE**. If plan 013 is not yet listed in the table (Batch 1 shipped without it), append
a new row in the appropriate place, matching the Batch-2 format:

```md
| 013  | Test-coverage expansion ($URL / WPT / query / types)   | P2       | M      | 001        | tests         | DONE       |
```

Also, if a "Batch 2" section exists in the README's "Audit summary", tick off TEST-07/08/09/10 from
the batch-2 backlog description.

**Verify**:

```
git diff advisor-plans/README.md
```

→ shows only the plan-013 row change (and optionally the batch-2 backlog line). No other
plan's row modified.

**Commit** (or fold into Stage 4's commit if the executor prefers — either is fine, note in
message):

```
docs(plans): mark 013 DONE
```

## Test plan

Summary of what this plan adds:

| Stage | File                             | Approx new tests | Focus                                           |
| ----- | -------------------------------- | ---------------- | ----------------------------------------------- |
| 1     | `test/url.test.ts`               | ~20              | `$URL` field mutation, getter-only, `createURL` |
| 2     | `test/wpt-urltestdata.test.ts`   | ~50–100          | WHATWG parity ratchet on special-scheme subset  |
| 3     | `test/query.test.ts`             | ~10              | `filterQuery`/`withQuery` combinators           |
| 4     | `test/types.test-d.ts`           | ~19              | Baseline types for 11 exports                   |
| Total |                                  | ~100–150         |                                                 |

Structural patterns to model after:

- Stage 1 → mirror `test/url.test.ts:5-33` describe/toMatchObject style.
- Stage 2 → mirror `test/punycode.test.ts` full file (fixture load + `.filter` + iterate).
- Stage 3 → mirror `test/query.test.ts` describe-per-function style.
- Stage 4 → mirror `test/types.test-d.ts` `expectTypeOf` + `declare const dyn: string` pattern.

Final verification:

```
pnpm lint && pnpm vitest run --typecheck
```

→ exit 0. Baseline was 509; final count should be `509 + N` where `N ≥ 60`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm vitest run --typecheck` exits 0.
- [ ] `pnpm vitest run 2>&1 | grep "Tests"` shows a test count of at least 569 (509 baseline + 60
      minimum new).
- [ ] `git log --oneline advisor/013-test-coverage-expansion ^HEAD~5` shows exactly 4 (or 5, if
      README update is a separate commit) commits, each conforming to conventional commits and
      matching the stage titles above.
- [ ] `git diff --stat main..advisor/013-test-coverage-expansion -- src/` returns nothing (no
      source changes on this branch beyond whatever was in the working tree at branch time).
- [ ] `git diff --stat main..advisor/013-test-coverage-expansion -- test/` shows only files from
      the in-scope list.
- [ ] `test/wpt-urltestdata.test.ts` exists and imports from `./fixture/urltestdata.json`.
- [ ] Skip-list total in Stage 2 (`EXPECTED_FAILURES.size + SKIP_LIST.size`) is ≤ 200.
- [ ] `advisor-plans/README.md` shows plan 013 status = **DONE**.
- [ ] No `test.only` and no `describe.only` in any modified file.
- [ ] No file under `src/` is staged in any of the four commits (`git show --stat <sha>`).

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm test` fails before Stage 1 (preflight failed → the in-flight tree is broken; not our
  problem).
- `test/url.test.ts` has been rewritten since `f06c800` such that the excerpts in "Current state"
  no longer match (Stage 1 drift).
- The Stage 2 skip list exceeds **200 entries** even after reducing `INITIAL_LIMIT` to 50 and
  scoping `SPECIAL_PREFIXES` to `["http:", "https:"]`. Report the actual size and the top 10
  distinct failure patterns; do NOT commit a skip-list that big — the corpus is bigger than the
  initial subset intent and the scope should be revisited by the advisor.
- The probe in Stage 3, item 3 throws or hangs (rather than returning a value).
- A Stage 4 `expectTypeOf` assertion cannot be reconciled with the actual return type reported by
  TypeScript, even after applying the "refined-baseline is correct" override.
- A step's verification fails **twice in a row** after a fix attempt.
- Any attempted change requires touching a file in the "Out of scope" list.
- The `--typecheck` gate is not present in `pnpm test` **AND** running
  `pnpm vitest run --typecheck` manually fails with a config error (i.e. plan 001 hasn't set up
  the gate). In that case, Stage 4 is genuinely blocked; skip Stage 4, commit Stages 1–3, and
  report.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Stage 2 is a ratchet.** As correctness plans (004 WHATWG scheme parity, 005 IPv6 host, 006
  base-fragment, 007 parseAuth) land, entries in `EXPECTED_FAILURES` will start passing — vitest's
  `test.fails` inverts, so a fixed case will FAIL with "expected to fail but passed". That is the
  signal to remove the entry from `EXPECTED_FAILURES` and confirm it now passes as a plain `test`.
  The skip-list only ever SHRINKS. Reviewers of those correctness plans should require the
  reviewer to touch this file to prove the ratchet moved.
- **Stage 2 subset can expand.** After the initial 100-case wire is green, incrementally bump
  `INITIAL_LIMIT` (200, 400, full) in follow-up PRs. Each bump likely adds new
  `EXPECTED_FAILURES` entries — that is fine as long as the ratchet mechanism holds.
- **`$URL` deprecation (Batch-2 plan DEBT-05).** When `$URL` is finally removed in v2, do NOT
  delete the Stage-1 tests outright. Wrap them in a `describe.skipIf(!$URL, "$URL — v1 only",
  () => {...})` block or a version-guarded skip so cross-version parity can still be measured
  from an install of the previous major.
- **Type tests: baseline first, refinement later.** Do NOT merge Stage 4 with any type-refinement
  PR. Separation of concerns: this plan pins the CURRENT baseline; the refinement PR (plan D1)
  updates the assertions to the new, narrower types. Reviewers of D1 should see a red-to-green
  diff on this file.
- **Reviewer scrutiny checklist for the Stage 2 PR**:
  - `EXPECTED_FAILURES` uses exact-string keys (not regex, not `startsWith`) so each entry is a
    concrete WPT input that can be individually removed by a future fix.
  - `SKIP_LIST` is only for cases that THROW; anything else belongs in `EXPECTED_FAILURES`.
  - `parseURL(input, base)` — if the two-argument form does not exist yet, base-relative cases
    should be filtered out at the `subset` stage, not silently mis-parsed with a discarded base.
- **Cross-version parity idea (deferred)**: once ufo publishes v2, this test file can be run
  against both majors via a `vitest.workspace` to spot regressions between them. That is not in
  scope now; noted here so a future maintainer sees the shape.
