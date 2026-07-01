# Plan 005: Fix `parseHost` to correctly parse bracketed IPv6 authorities (CORR-01)

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md` if that file exists; if it does not, skip — the advisor
> maintains the index.
>
> **Drift check (run first)**:
>
> ```bash
> cd /Users/i584843/SAPDevelop/dev/ufo
> git diff --stat f06c800..HEAD -- src/parse.ts src/url.ts test/parse.test.ts test/url.test.ts
> ```
>
> If any in-scope file has changed since this plan was written, compare the "Current state"
> excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED — behavior change is a bug-fix, not a redesign; low collateral risk if tests
  are dense.
- **Depends on**: `001-verification-baseline.md` (its FIXME(CORR-01) characterization tests are
  the ones this plan flips)
- **Category**: bug
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`parseHost` splits its input on `:` unconditionally via the regex
`/([^/:]*):?(\d+)?/`. Bracketed IPv6 authorities like `[::1]:8080` contain multiple `:` characters
inside the address itself, so the current implementation returns garbage:

- `parseHost("[::1]:8080")` → `{ hostname: "[" }` (no `port` key at all — verified against
  `dist/index.mjs` at `f06c800`)
- `parseHost("[::1]")` → `{ hostname: "[" }` (verified)
- `parseHost("[2001:db8::1]:443")` → `{ hostname: "[2001" }` (regex captures `[` up to first `:`;
  because next char is `:` not a digit, port group is undefined; also probable — verify with a
  quick REPL run at Step 0)

This cascades into `$URL` (the `@deprecated`-but-still-shipped class in `src/url.ts`):

- `new $URL("http://[::1]:8080/x").hostname === "["` (via `url.ts:41` which delegates to
  `parseHost(this.host).hostname`)
- `new $URL("http://[::1]:8080/x").port === ""` (via `url.ts:45` — `port || ""` swallows the
  `undefined`)

Note that `parseURL(...).host` is **not** broken — the host substring is preserved verbatim in
`ParsedURL.host` (see `src/parse.ts:parseURL` — it lifts the `host` token whole, only `parseHost`
mangles it when asked to split). So `stringifyParsedURL(parseURL("http://[::1]:8080/x"))`
round-trips fine today; the bug is confined to the `hostname`/`port` split.

WHATWG rules: the bracketed form `[...]` is mandatory for IPv6 hostnames in URL text, and any port
follows the closing bracket (`[::1]:8080`). Node's `new URL(...).hostname` returns the
bracket-wrapped form (`"[::1]"`), and this plan aligns ufo with that convention.

## Current state

### Files in scope (and their role)

- `src/parse.ts` — contains the buggy `parseHost` at line 171 and the `ParsedHost` interface at
  line 30. Also contains `stringifyParsedURL` (~line 200 area) which does NOT call `parseHost` —
  it emits `parsed.host` verbatim, so round-trip is unaffected.
- `src/url.ts` — the `@deprecated` `$URL` class. Lines 40–46 delegate `hostname` and `port` getters
  to `parseHost`. This plan requires zero edits to `src/url.ts`: once `parseHost` is fixed, the
  `$URL` getters yield correct values automatically. Only `test/url.test.ts` gains cascade
  regression coverage.
- `test/parse.test.ts` — houses the `parseHost` characterization tests added by plan 001 with
  `FIXME(CORR-01)` markers. This plan flips them to the correct expectations and removes the
  FIXME.
- `test/url.test.ts` — currently exercises `$URL` with `example.com:1080`. This plan appends a
  small IPv6 cascade block.

### Excerpts you will need to see (verify these match your working tree)

Current `parseHost` at `src/parse.ts:155–177` (the buggy implementation):

```ts
/**
 * Takes a string, and returns an object with two properties: `hostname` and `port`.
 *
 * @example
 *
 * ```js
 * parseHost("foo.com:8080");
 * // { hostname: 'foo.com', port: '8080' }
 * ```
 *
 * @group parsing_utils
 *
 * @param [input] - The URL to parse.
 * @returns A function that takes a string and returns an object with two properties: `hostname` and
 * `port`.
 */
export function parseHost(input = ""): ParsedHost {
  const [hostname, port] = (input.match(/([^/:]*):?(\d+)?/) || []).splice(1);
  return {
    hostname: decode(hostname),
    port,
  };
}
```

`ParsedHost` interface at `src/parse.ts:30–33` (declared type — note `port: string`):

```ts
export interface ParsedHost {
  hostname: string;
  port: string;
}
```

**Type note**: the declared `port: string` under-describes runtime reality. At runtime `port` is
`string | undefined` today (regex group 2 fails to match → destructured value is `undefined`).
This plan preserves that runtime shape (see Step 1) — the returned object has a `port` key that
may be `undefined`, sometimes even absent when the regex has zero matches. Do NOT widen
`ParsedHost.port` to `string | undefined` in this plan; that type-level change is deferred to
plan D2 (finalize `_types.ts` in the in-flight type work). See Out of scope below.

`$URL` cascade at `src/url.ts:40–46` — the delegator that inherits the bug and inherits the fix:

```ts
  get hostname(): string {
    return parseHost(this.host).hostname;
  }

  get port(): string {
    return parseHost(this.host).port || "";
  }
```

`stringifyParsedURL` at `src/parse.ts` (relevant excerpt showing round-trip does NOT touch
`parseHost` — it emits `parsed.host` verbatim between `://` and the pathname):

```ts
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string {
  const pathname = parsed.pathname || "";
  const search = parsed.search
    ? (parsed.search.startsWith("?") ? "" : "?") + parsed.search
    : "";
  const hash = parsed.hash || "";
  const auth = parsed.auth ? `${parsed.auth}@` : "";
  const host = parsed.host || "";
  const proto
    = parsed.protocol || parsed[protocolRelative]
      ? `${parsed.protocol || ""}//`
      : "";
  return proto + auth + host + pathname + search + hash;
}
```

**Round-trip implication**: because `stringifyParsedURL` re-emits `parsed.host` verbatim (the raw
`[::1]:8080` substring), and because `parseURL` populates `ParsedURL.host` from the URL text
verbatim (it does **not** call `parseHost` internally), the round-trip
`stringifyParsedURL(parseURL("http://[::1]:8080/x"))` already yields
`"http://[::1]:8080/x"` today. Assert this as a control test — do NOT expect the fix in Step 1 to
change it. The fix affects only `parseHost` return values and, via delegation, `$URL.hostname` /
`$URL.port`.

### FIXME(CORR-01) tests to flip (from plan 001)

Plan 001 appends this `describe` block to `test/parse.test.ts` (paraphrased — if 001 has not
landed yet in your working tree, add these characterization tests first as part of Step 1 here,
then flip them, so the diff still shows the buggy→correct transition):

```ts
describe("parseHost — IPv6 (characterization)", () => {
  it("parses an IPv4-style host:port control case correctly", () => {
    expect(parseHost("example.com:8080")).toStrictEqual({
      hostname: "example.com",
      port: "8080",
    });
  });

  // FIXME(CORR-01): plan 005 changes these to correctly extract the bracketed
  // IPv6 address and (if present) the port after the closing bracket.
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

Confirm the shape you find in the working tree matches this paraphrase before flipping. If plan
001 has NOT landed and you have to add these first, use the exact block above (copy verbatim into
`test/parse.test.ts` after the existing `parseURL` block), then continue with the flip in Step 3.

### In-flight work you MUST NOT disturb

At `f06c800`, the working tree has uncommitted type-safety work owned by plan D1 (finalize
`_types.ts`). `git status --short` at baseline should show at minimum:

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

If plan 001 has landed, add:

```
 M .github/workflows/ci.yml
 M test/parse.test.ts
 M test/base.test.ts
 M test/query.test.ts
```

The `M src/parse.ts` entry is D1's overload additions on `parseURL` / `parsePath` (unrelated to
`parseHost`). Do NOT revert those. Your Step 1 edit is additive/replacement inside `parseHost`
only.

Do NOT touch:

- `src/_types.ts` — owned by plan D1.
- `test/types.test-d.ts` — owned by plan D1.
- `tsconfig.json` — owned by plan 008.
- Any file outside `src/parse.ts`, `test/parse.test.ts`, `test/url.test.ts`.

### `parseHost` callers (verify with `grep`)

At `f06c800`:

```
src/url.ts:1:  import { parseURL, parseAuth, parseHost } from "./parse";
src/url.ts:41:     return parseHost(this.host).hostname;
src/url.ts:45:     return parseHost(this.host).port || "";
src/parse.ts:161: * parseHost("foo.com:8080");    (docblock)
src/parse.ts:171: export function parseHost(input = ""): ParsedHost {
```

Only `$URL` in `src/url.ts` consumes `parseHost` inside `src/`. Fixing `parseHost` fixes the
cascade automatically. No other `src/` file needs edits.

### Repo conventions

- **Test framework**: Vitest 4.x. Existing tests use `import { describe, expect, test } from "vitest"` (`test/url.test.ts`) or `import { describe, it, expect } from "vitest"` (`test/parse.test.ts`). Use whichever form the surrounding file already uses.
- **Import style**: barrel import from `"../src"`. `parseHost` is already on `test/parse.test.ts:2`; `$URL` is already on `test/url.test.ts:2`.
- **Assertion style**: `expect(fn(input)).toStrictEqual(expected)` for objects; `.toBe(...)` for strings. `toStrictEqual` distinguishes "missing key" from `key: undefined`, so you can pick the shape you want to lock in.
- **Docblock style**: JSDoc on exported functions; keep the existing `@example` and `@group parsing_utils`. Extend the `@example` with an IPv6 case (see Step 1).
- **Commit style**: conventional commits scoped by area. Examples from `git log --oneline`: `fix(parse): support IPv6 host with brackets`. Use `fix(parse):` for the source change and `test(parse):` / `test(url):` for the test flips.
- **Branch**: `advisor/005-parsehost-ipv6`.
- **Zero runtime deps**: do NOT import from anything outside `src/**`. Pure-JS string manipulation only. No new npm deps.

## Commands you will need

| Purpose                      | Command                                | Expected on success                              |
| ---------------------------- | -------------------------------------- | ------------------------------------------------ |
| Install                      | `pnpm install`                         | exit 0                                           |
| Full test (lint + typecheck) | `pnpm test`                            | `Tests M passed`, exit 0                         |
| Runtime tests only           | `pnpm vitest run`                      | exit 0                                           |
| One test file                | `pnpm vitest run test/parse.test.ts`   | exit 0                                           |
| Lint                         | `pnpm lint`                            | exit 0                                           |
| Lint autofix                 | `pnpm lint:fix`                        | exit 0, working tree may change                  |
| Build (sanity)               | `pnpm build`                           | exit 0                                           |
| Runtime probe (ad hoc)       | `pnpm build && node -e "import('./dist/index.mjs').then(m => console.log(m.parseHost('[::1]:8080')))"` | prints the current parseHost result             |

Package manager is pinned via `packageManager` in `package.json`. Do not use npm or yarn.

## Suggested executor toolkit

- Skill `vitest` for `toStrictEqual` vs `toEqual` semantics if unsure about "missing key" vs `key: undefined`.
- No other tooling required. This plan is a single-function surgical fix + test flips.

## Scope

**In scope** (the only files you may modify):

- `src/parse.ts` — rewrite `parseHost` function body only. Do NOT touch the `ParsedHost` interface at line 30.
- `test/parse.test.ts` — flip the FIXME(CORR-01) block; optionally add extra edge-case cases (see Step 3).
- `test/url.test.ts` — append IPv6 cascade tests for `$URL`.

**Out of scope** (do NOT touch — even if you spot related issues):

- `src/url.ts` — no source edit needed; the cascade is automatic. If your fix appears to require `src/url.ts` changes, STOP.
- `src/utils.ts` — no changes expected. If required, STOP; scope has expanded.
- `src/_types.ts` and `test/types.test-d.ts` — owned by plan D1. `ParseHost<...>` type-level function (if any) stays in D1's world.
- The `ParsedHost` interface declaration (`src/parse.ts:30–33`) — widening `port` to `string | undefined` is deferred to plan D2 (finalize `_types.ts`). Any type widening here would collide with D2.
- `stringifyParsedURL` — no change required (verified above).
- `tsconfig.json`, `.eslintrc*`, `.prettierrc*`, `README.md`, `CHANGELOG.md`.
- `dist/` — the repo builds `dist/` only on release. Do not commit `dist/`.

## Git workflow

- Branch: `advisor/005-parsehost-ipv6`
- Two commits recommended:
  1. `fix(parse): support IPv6 host with brackets`  — the `parseHost` rewrite.
  2. `test(parse,url): cover IPv6 in parseHost and $URL cascade`  — the test flips and cascade tests.
  Alternatively, one squashed commit `fix(parse): support IPv6 host with brackets` is fine — mention both source + test flip in the body.
- Do NOT push. Do NOT open a PR. Do NOT run `pnpm release`. The operator handles publishing.

## Steps

### Step 0: Confirm baseline is green

```bash
cd /Users/i584843/SAPDevelop/dev/ufo
git rev-parse --short HEAD
git status --short
pnpm install
pnpm test 2>&1 | tail -20
```

Then run the runtime probe to confirm the bug is still present (not silently fixed by someone
else):

```bash
pnpm build
node -e "import('./dist/index.mjs').then(m => { console.log('r1', m.parseHost('[::1]:8080')); console.log('r2', m.parseHost('[::1]')); console.log('r3', m.parseHost('[2001:db8::1]:443')); console.log('r4', m.parseHost('example.com:8080')); });"
```

**Verify**:

- `git rev-parse --short HEAD` → `f06c800` (or newer if plan 001 has landed).
- `git status --short` → shows the in-flight D1 modifications listed above; if plan 001 has landed, also its test-file modifications.
- `pnpm test` → exits 0. Test count ≥ 509 (baseline) or ≥ 536 (if plan 001 landed and added its 27 characterization tests).
- Probe output:
  - `r1 { hostname: '[', port: undefined }` (or `{ hostname: '[' }` when logged via inspection — the underlying object shape is `{ hostname: '[', port: undefined }`; `console.log` may render either)
  - `r2 { hostname: '[', port: undefined }`
  - `r3 { hostname: '[2001', port: undefined }`
  - `r4 { hostname: 'example.com', port: '8080' }`

If `r1`/`r2`/`r3` come back CORRECT (e.g. `{ hostname: '[::1]', port: '8080' }`), STOP — someone
fixed this independently, this plan is obsolete, report the divergence.

If `pnpm test` fails or reports fewer than 509 tests, STOP — a red baseline blocks this plan.

### Step 1: Rewrite `parseHost` to branch on `startsWith("[")`

Open `src/parse.ts`. Locate `parseHost` at line 171. Replace the **function body only** (do not
touch the JSDoc block above or the `ParsedHost` interface at line 30). The signature stays as
`export function parseHost(input = ""): ParsedHost`.

Extend the JSDoc `@example` with an IPv6 line so future readers see the supported shape at a
glance.

Target shape after the edit:

```ts
/**
 * Takes a string, and returns an object with two properties: `hostname` and `port`.
 *
 * IPv6 authorities must be wrapped in `[...]` per WHATWG. The returned `hostname`
 * keeps the surrounding brackets to match `new URL(...).hostname` in Node/browsers,
 * so `stringifyParsedURL` and `$URL.href` re-emit the address unchanged.
 *
 * @example
 *
 * ```js
 * parseHost("foo.com:8080");
 * // { hostname: 'foo.com', port: '8080' }
 *
 * parseHost("[::1]:8080");
 * // { hostname: '[::1]', port: '8080' }
 * ```
 *
 * @group parsing_utils
 *
 * @param [input] - The URL to parse.
 * @returns An object with `hostname` and `port` (the port is undefined when absent).
 */
export function parseHost(input = ""): ParsedHost {
  // TODO(v2): IPv6 zone-id normalization (e.g. "[fe80::1%25eth0]" — the "%25eth0"
  // suffix inside the brackets). Currently returned verbatim inside the hostname;
  // callers do not decode the zone-id.
  if (input.startsWith("[")) {
    const end = input.indexOf("]");
    if (end === -1) {
      // Malformed: unclosed bracket. Return the input verbatim as hostname; no port.
      return { hostname: decode(input), port: undefined as unknown as string };
    }
    const hostname = decode(input.slice(0, end + 1)); // keep brackets — matches WHATWG URL.hostname
    const rest = input.slice(end + 1);
    if (rest.startsWith(":")) {
      const p = rest.slice(1);
      return { hostname, port: (p.length > 0 ? p : undefined) as unknown as string };
    }
    return { hostname, port: undefined as unknown as string };
  }
  // Non-IPv6 fast path — preserve historical regex-based behavior.
  const [hostname, port] = (input.match(/([^/:]*):?(\d+)?/) || []).splice(1);
  return {
    hostname: decode(hostname),
    port,
  };
}
```

Rationale for each choice:

- **Bracket branch**: `input.startsWith("[")` is O(1) and unambiguous — bracketed authorities are
  the only IPv6 shape the standard allows in URL text.
- **Brackets kept in `hostname`**: matches `new URL("http://[::1]:8080/x").hostname === "[::1]"`
  in Node/browsers. This means `parsed.host` (which contains `"[::1]:8080"`) can be re-emitted by
  `stringifyParsedURL` verbatim (already the case — see Current state). It also means
  `$URL.hostname` — which reads from `parseHost(this.host).hostname` — becomes `"[::1]"`, aligning
  with WHATWG.
- **`decode(...)`**: the existing implementation calls `decode(hostname)`. Preserve that on the
  IPv6 hostname string too, for symmetry. Percent-encoding inside IPv6 literals is rare but the
  bracket characters themselves are not percent-encoded, so `decode("[::1]")` returns `"[::1]"`
  unchanged.
- **`undefined as unknown as string`**: the declared `ParsedHost.port` is `string`, but the
  regex-based fast path already returns `undefined` at runtime when the port group is absent.
  Preserve that runtime shape so downstream consumers (including `$URL.port` which does `port || ""`)
  continue to work identically for absent-port inputs. The double-cast is ugly but keeps the type
  signature stable for plan D2 to widen later. Do NOT change the interface — see Out of scope.
- **Unclosed-bracket fallback**: returning the raw input as hostname is defensive; a WHATWG parser
  would throw, but ufo has been permissive historically. If a follow-up plan wants stricter
  handling, that is a separate change.
- **`TODO(v2)` comment**: signposts that IPv6 zone-id (`%25eth0`) normalization is unfinished,
  matching the "Maintenance notes" section of this plan.

**Verify**:

```bash
git diff HEAD -- src/parse.ts | head -60
```

Expected: shows only the JSDoc extension and the `parseHost` body replacement. The `ParsedHost`
interface at line 30 must be untouched. The `parseURL` overloads and every other function in the
file must be untouched.

```bash
pnpm lint
```

Expected: exit 0. If prettier complains, run `pnpm lint:fix` and re-run.

```bash
pnpm build
node -e "import('./dist/index.mjs').then(m => { console.log('r1', m.parseHost('[::1]:8080')); console.log('r2', m.parseHost('[::1]')); console.log('r3', m.parseHost('[2001:db8::1]:443')); console.log('r4', m.parseHost('example.com:8080')); console.log('r5', m.parseHost('[::1')); });"
```

Expected:

- `r1 { hostname: '[::1]', port: '8080' }`
- `r2 { hostname: '[::1]', port: undefined }`
- `r3 { hostname: '[2001:db8::1]', port: '443' }`
- `r4 { hostname: 'example.com', port: '8080' }`  ← non-IPv6 unchanged
- `r5 { hostname: '[::1', port: undefined }`  ← unclosed bracket, verbatim

If any of these deviate, STOP and re-read the fix code before continuing.

### Step 2: Verify `$URL` cascade works without editing `src/url.ts`

Do NOT modify `src/url.ts`. Run:

```bash
node -e "import('./dist/index.mjs').then(m => { const u = new m.\$URL('http://[::1]:8080/x'); console.log('hostname', JSON.stringify(u.hostname)); console.log('port', JSON.stringify(u.port)); console.log('href', JSON.stringify(u.href)); console.log('host', JSON.stringify(u.host)); });"
```

Expected:

- `hostname "[::1]"`
- `port "8080"`
- `host "[::1]:8080"`
- `href "http://[::1]:8080/x"`  ← round-trip preserved

Then confirm no `src/url.ts` diff:

```bash
git diff HEAD --name-only | grep '^src/url\.ts$'
```

Expected: no output (empty). If `src/url.ts` appears in the diff, revert your edits there — the
cascade works without touching it.

### Step 3: Flip the FIXME(CORR-01) tests and add coverage in `test/parse.test.ts`

Open `test/parse.test.ts`. Locate the `describe("parseHost — IPv6 (characterization)", ...)` block
added by plan 001. Replace the entire block with the correct-behavior version below. If plan 001
has NOT landed and the block does not exist, add the block below directly (also including the
control test the block includes for completeness).

```ts
describe("parseHost — IPv6", () => {
  it("parses a non-IPv6 host:port (control — non-IPv6 fast path)", () => {
    expect(parseHost("example.com:8080")).toStrictEqual({
      hostname: "example.com",
      port: "8080",
    });
  });

  it("parses [::1]:8080 as hostname='[::1]' + port='8080'", () => {
    expect(parseHost("[::1]:8080")).toStrictEqual({
      hostname: "[::1]",
      port: "8080",
    });
  });

  it("parses [::1] with no port", () => {
    expect(parseHost("[::1]")).toStrictEqual({
      hostname: "[::1]",
      port: undefined,
    });
  });

  it("parses [2001:db8::1]:443", () => {
    expect(parseHost("[2001:db8::1]:443")).toStrictEqual({
      hostname: "[2001:db8::1]",
      port: "443",
    });
  });

  it("parses the unspecified address [::]", () => {
    expect(parseHost("[::]")).toStrictEqual({
      hostname: "[::]",
      port: undefined,
    });
  });

  it("preserves the raw input for a malformed unclosed bracket", () => {
    // No throw; permissive parse. Callers can validate downstream.
    expect(parseHost("[::1")).toStrictEqual({
      hostname: "[::1",
      port: undefined,
    });
  });

  it("returns undefined port for [::1]: with an empty port segment", () => {
    // Trailing ":" with no digits — treat as no port, do not surface "".
    expect(parseHost("[::1]:")).toStrictEqual({
      hostname: "[::1]",
      port: undefined,
    });
  });

  it("keeps IPv6 zone-id inside the hostname verbatim (see TODO(v2))", () => {
    // Zone-id normalization is deferred (see TODO(v2) comment in src/parse.ts).
    // For now assert current behavior so the deferral is explicit and any change
    // to zone-id handling has to update this test.
    expect(parseHost("[fe80::1%25eth0]:80")).toStrictEqual({
      hostname: "[fe80::1%25eth0]",
      port: "80",
    });
  });
});

describe("parseURL — IPv6 round-trip", () => {
  it("stringifyParsedURL(parseURL(x)) === x for a bracketed IPv6 URL with port", () => {
    const input = "http://[::1]:8080/x";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });

  it("stringifyParsedURL(parseURL(x)) === x for a bracketed IPv6 URL without port", () => {
    const input = "http://[::1]/x";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });

  it("stringifyParsedURL(parseURL(x)) === x for a full IPv6 URL with port", () => {
    const input = "https://[2001:db8::1]:443/api?q=1#top";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });
});
```

**Import guard**: the current `test/parse.test.ts` has
`import { parseURL, parseHost, parseFilename } from "../src";`. Extend it to include
`stringifyParsedURL`:

```ts
import { parseFilename, parseHost, parseURL, stringifyParsedURL } from "../src";
```

Do NOT create a second import statement. Do NOT reorder existing imports.

**FIXME cleanup**: after this edit, `grep -c 'FIXME(CORR-01)' test/parse.test.ts` must be `0`.

**Verify**:

```bash
pnpm vitest run test/parse.test.ts 2>&1 | tail -10
```

Expected: exit 0. All `parseHost` IPv6 tests pass (8 new + 1 control retained = 9 in the IPv6
block). All `parseURL` IPv6 round-trip tests pass (3). Existing `parseURL`, `parseFilename`, and
plan-001-added `parseAuth` tests remain green.

```bash
grep -c 'FIXME(CORR-01)' test/parse.test.ts
```

Expected: `0`.

```bash
grep -c '\[::1\]' test/parse.test.ts
```

Expected: `>= 6`.

### Step 4: Add `$URL` IPv6 cascade tests in `test/url.test.ts`

Open `test/url.test.ts`. Append a new `describe` block after the existing `describe("$URL", ...)`
block. Do NOT modify existing tests.

```ts
describe("$URL — IPv6", () => {
  test("hostname keeps the brackets and port is separated correctly", () => {
    const url = new $URL("http://[::1]:8080/x");
    expect(url.host).toBe("[::1]:8080");
    expect(url.hostname).toBe("[::1]");
    expect(url.port).toBe("8080");
    expect(url.href).toBe("http://[::1]:8080/x");
    expect(url.toString()).toBe(url.href);
  });

  test("hostname keeps the brackets and port is empty when omitted", () => {
    const url = new $URL("http://[::1]/x");
    expect(url.host).toBe("[::1]");
    expect(url.hostname).toBe("[::1]");
    expect(url.port).toBe("");
    expect(url.href).toBe("http://[::1]/x");
  });

  test("full IPv6 with port round-trips through .href", () => {
    const input = "https://[2001:db8::1]:443/api?q=1#top";
    const url = new $URL(input);
    expect(url.hostname).toBe("[2001:db8::1]");
    expect(url.port).toBe("443");
    expect(url.href).toBe(input);
  });
});
```

Note: `test/url.test.ts` currently uses `test`, not `it`. Keep `test(...)` for consistency inside
this file.

**Verify**:

```bash
pnpm vitest run test/url.test.ts 2>&1 | tail -10
```

Expected: exit 0. 3 new tests pass. Existing `$URL` tests remain green.

### Step 5: Full-suite verification

```bash
pnpm lint
pnpm test 2>&1 | tail -20
git status --short
git diff HEAD --name-only
```

Expected:

- `pnpm lint` → exit 0. If prettier complains about your new blocks, `pnpm lint:fix`, re-run
  lint. If it still fails, STOP.
- `pnpm test` → exit 0. Test count is baseline + (11 in `test/parse.test.ts` — 8 IPv6 parseHost +
  3 IPv6 round-trip) + (3 in `test/url.test.ts`) = **+14** vs the state at Step 0. If plan 001 was
  the baseline (536), you should see **550** runtime tests. If plan 001 had not landed and you
  wrote the characterization block from scratch (which included 4 IPv6 parseHost cases as buggy
  before you flipped them), your net delta may differ — count carefully. The critical constraint
  is that `pnpm test` passes and no test is `.skip`ped.
- `git status --short` → shows exactly:
  - `M src/parse.ts` (was already `M` at baseline for D1 in-flight; you added the `parseHost` rewrite on top; verify `git diff HEAD -- src/parse.ts` shows only your `parseHost` change plus the pre-existing D1 overload additions).
  - `M test/parse.test.ts`
  - `M test/url.test.ts` (this may be new — was untouched at baseline).
- `git diff HEAD --name-only` must NOT include `src/url.ts`, `src/utils.ts`, `src/_types.ts`, `test/types.test-d.ts`, or `tsconfig.json`.

Sanity-verify no other `src/` file was touched:

```bash
git diff HEAD --name-only | grep '^src/' | grep -v '^src/parse\.ts$' | grep -v '^src/_types\.ts$' | grep -v '^src/index\.ts$' | grep -v '^src/query\.ts$' | grep -v '^src/utils\.ts$'
```

Expected: no output (empty). The pre-existing D1 modifications on `src/{index,parse,query,utils}.ts`
are OK; anything else prints and is a STOP condition.

### Step 6: Update `advisor-plans/README.md`

Change the row for plan 005 from `TODO` to `DONE`. Format:

| Plan | Title                                                    | Priority | Effort | Depends on | Category | Status |
| ---- | -------------------------------------------------------- | -------- | ------ | ---------- | -------- | ------ |
| 005  | CORR-01 `parseHost` IPv6 bracket handling                | P1       | S      | 001        | bug      | DONE   |

**Verify**:

```bash
grep -c '| 005 .*| DONE' advisor-plans/README.md
```

Expected: `1`.

## Test plan

New tests to write, by file:

- `test/parse.test.ts`:
  - Replace the plan-001 `describe("parseHost — IPv6 (characterization)", ...)` block with a corrected `describe("parseHost — IPv6", ...)` block (8 cases: control non-IPv6, `[::1]:8080`, `[::1]` no port, `[2001:db8::1]:443`, `[::]`, unclosed `[::1`, empty-port `[::1]:`, zone-id `[fe80::1%25eth0]:80`).
  - Add `describe("parseURL — IPv6 round-trip", ...)` (3 cases: `http://[::1]:8080/x`, `http://[::1]/x`, `https://[2001:db8::1]:443/api?q=1#top`).
- `test/url.test.ts`:
  - Append `describe("$URL — IPv6", ...)` (3 cases: hostname+port, hostname-only, full round-trip).

Structural pattern to follow:

- `test/parse.test.ts` uses `describe(...) { it(...) { expect(...) } }` with `toStrictEqual` for objects — match that.
- `test/url.test.ts` uses `describe(...) { test(...) { expect(...) } }` with `toBe` for scalar `.hostname`/`.port`/`.href` — match that.

Rationale for the round-trip block being in `test/parse.test.ts`: `stringifyParsedURL` and
`parseURL` are `src/parse.ts` symbols, and the round-trip test is a stronger correctness gate than
per-function unit tests. Keep it co-located with the other `parseURL` tests.

Final coverage command (optional sanity):

```bash
pnpm vitest run --coverage 2>&1 | tail -20
```

Expected: exit 0. Coverage of the bracket branch in `parseHost` is now hit (previously
unreachable). Do not enforce a numeric coverage threshold.

## Done criteria

ALL must hold, machine-checkable:

- [ ] `pnpm test` exits 0.
- [ ] `pnpm typecheck` exits 0 (same as `pnpm test` in this repo, but re-running is cheap).
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] Runtime probe against the freshly built `dist/index.mjs`:
      `node -e "import('./dist/index.mjs').then(m => { const r = m.parseHost('[::1]:8080'); if (r.hostname !== '[::1]' || r.port !== '8080') { process.exit(1); } })"` → exits 0.
- [ ] `grep -c 'FIXME(CORR-01)' test/parse.test.ts` → `0`.
- [ ] `grep -c 'startsWith(\"\\[\")' src/parse.ts` → `>= 1` (the bracket branch exists in `parseHost`).
- [ ] `grep -c 'TODO(v2): IPv6 zone-id' src/parse.ts` → `1`.
- [ ] `git status --short` shows only the in-scope files changed (plus pre-existing in-flight D1 mods, unchanged).
- [ ] `git diff HEAD --name-only` does NOT include `src/url.ts`, `src/utils.ts`, `src/_types.ts`, `test/types.test-d.ts`, or `tsconfig.json`.
- [ ] `advisor-plans/README.md` status row for plan 005 shows `DONE`.

## STOP conditions

Stop and report back (do not improvise) if any of these occur:

- **`parseHost` implementation has changed since `f06c800`**: the "Current state" excerpt of the
  buggy regex-based body does not match what you find in `src/parse.ts:171`. Someone rewrote it —
  reconcile before proceeding.
- **The bug is already fixed**: at Step 0, the runtime probe shows `parseHost("[::1]:8080")`
  already returns `{ hostname: '[::1]', port: '8080' }`. This plan is obsolete — report the fix's
  origin (recent commit? a merged PR?) instead of duplicating it.
- **Plan 001's characterization tests conflict with this plan's design decision**: if the
  FIXME(CORR-01) block in `test/parse.test.ts` was written assuming brackets are STRIPPED from
  `hostname` (i.e., expects `hostname: "::1"` post-fix), reconcile. This plan chose
  brackets-INCLUDED to match Node/WHATWG. If plan 001 committed to a different convention, escalate.
- **In-flight D1 files are missing**: `git status --short` at Step 0 does not show
  `?? src/_types.ts` and modifications to `src/{index,parse,query,utils}.ts` +
  `test/types.test-d.ts` + `tsconfig.json`. Baseline is invalidated.
- **`src/url.ts` diff appears**: your fix should require zero edits to `src/url.ts`. If you find
  yourself editing it, STOP — you probably fixed `parseHost` incorrectly (e.g., changed the return
  shape so the delegators break).
- **`ParsedHost` interface needs widening**: if TypeScript refuses to compile the new `parseHost`
  because it complains about `port: undefined` not being assignable to `port: string`, STOP. Plan
  D2 owns the interface widening. Workaround in this plan: the `undefined as unknown as string`
  cast keeps the runtime shape identical to today (regex path already returned `undefined` at
  runtime) without changing the type. If the cast fails to compile, escalate — the fix was drafted
  against the type signature as it exists at `f06c800`.
- **`src/utils.ts` needs edits**: STOP. Scope has expanded and this plan doesn't own that.
- **A step's verification fails twice after a reasonable fix attempt**: STOP.

## Maintenance notes

For whoever owns this code after the change lands:

- **Behavior change**: `parseHost` now returns bracket-preserved IPv6 hostnames and correctly
  separates the port. Consumers of `parseHost`, `parseURL(...).host`, and `$URL.hostname` for
  IPv6 inputs may have hand-rolled workarounds (their own `[]` handling or `.split("]")` calls).
  Mention this in `CHANGELOG.md` when the maintainer prepares the next release — this is a
  bug-fix-shaped breaking change for anyone relying on the mangled output.
- **Deferred: IPv6 zone-id normalization** (`%25eth0` inside the brackets). Left verbatim inside
  the hostname string. The `TODO(v2)` comment next to the bracket branch signposts this. A future
  contributor picking this up needs to (a) decide whether zone-id belongs in `.hostname` or a
  separate field, (b) update `ParsedHost` if the shape changes, (c) update the
  `[fe80::1%25eth0]:80` characterization test in `test/parse.test.ts`.
- **Deferred: IPv6 percent-encoding in `.href` output**. Node's WHATWG parser sometimes
  percent-encodes non-ASCII bytes inside IPv6 zone-ids. `$URL.href` in this fix does NOT
  reproduce that. Belongs to a WHATWG-parity plan.
- **Deferred: `ParsedHost.port` type widening** to `string | undefined`. Owned by plan D2 as part
  of finalizing `_types.ts`. This plan keeps runtime shape stable (matches today's regex-path
  behavior) via a cast, so D2 can widen the type without a runtime surprise.
- **`$URL` is `@deprecated` since v1.4.0**. It is still shipped. Any behavior change to
  `parseHost` cascades into `$URL`. If a future plan removes `$URL`, this plan's `$URL` IPv6
  cascade tests come out cleanly with the class.
- **Reviewer focus for the resulting PR**:
  1. Confirm the `parseHost` diff is confined to the function body (no touching of `ParsedHost` interface, no touching of other functions).
  2. Confirm `src/url.ts` is NOT in the diff.
  3. Confirm `test/parse.test.ts` no longer contains `FIXME(CORR-01)`.
  4. Confirm the round-trip test `stringifyParsedURL(parseURL("http://[::1]:8080/x")) === "http://[::1]:8080/x"` passes — this is the strongest correctness gate.
  5. Skim for any accidental commit of `dist/`.
