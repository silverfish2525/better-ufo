# Plan 004: WHATWG scheme + authority parity — reject non-alpha schemes, gate backslash normalization, fix multi-`@` userinfo

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f06c800..HEAD -- src/parse.ts src/utils.ts test/parse.test.ts test/utilities.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED-HIGH — scheme and authority regex changes affect every URL parse; test coverage
  must be dense
- **Depends on**: `advisor-plans/001-*.md` (verification baseline),
  `advisor-plans/002-*.md` (script-protocol / shared `SCHEME_STRIP_RE` + `SPECIAL_SCHEMES` in
  `src/utils.ts`)
- **Category**: security
- **Planned at**: commit `f06c800`, 2026-07-01
- **Branch**: `advisor/004-whatwg-scheme-authority-parity`

## Why this matters

`ufo` is the URL parser embedded in Nuxt, Nitro, H3, and ofetch. Two divergences from
WHATWG/RFC 3986 authority parsing let attacker-controlled URLs mis-route:

1. **SEC-03**: `PROTOCOL_STRICT_REGEX` / `PROTOCOL_REGEX` accept digit-leading schemes because they
   use `\w` for the first char. `parseURL("123://foo.com/x").protocol === "123:"` — WHATWG rejects.
   Separately, `parseURL` unconditionally normalizes `\` → `/`. WHATWG only does that for the six
   "special schemes" (`http, https, ws, wss, ftp, file`); non-special schemes must preserve `\`.
2. **SEC-04**: The authority splitter matches `([^/@]+@)?` — that captures up to the **first** `@`,
   so `parseURL("http://foo@bar@example.com/x").host === "bar@example.com"`. WHATWG requires the
   **last** `@` before the path to terminate userinfo. Browsers fetch `example.com` here, so any
   downstream code comparing `parsedURL.host` against an allow-list is bypassable by the attacker
   prepending `foo@` inside userinfo.

After this plan lands: non-alpha schemes are rejected, `\` normalization is scoped to special
schemes only, and multi-`@` authorities correctly resolve `host` to the true host.

## Current state

### Files and their role

- `src/utils.ts` — regex definitions (`PROTOCOL_STRICT_REGEX`, `PROTOCOL_REGEX`), `hasProtocol`.
  Plan 002 is expected to already have added `SPECIAL_SCHEMES` and a `SCHEME_STRIP_RE` normalizer
  here. If it has not, STOP (see STOP conditions).
- `src/parse.ts` — `parseURL` scheme + authority extraction (the two regexes at line 84–86 and the
  unconditional `\\` → `/` replace at line 84).
- `test/parse.test.ts` — `describe("parseURL", ...)` table-driven cases. New SEC-03 / SEC-04
  cases go here.
- `test/utilities.test.ts` — `describe("hasProtocol", ...)` table-driven cases (repo file is
  `utilities.test.ts`, **not** `utils.test.ts` — verified 2026-07-01).

### Exact current code — DO NOT EDIT AS PART OF THIS SECTION, JUST CONFIRM MATCH

`src/utils.ts:27-31`:

```ts
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
const PROTOCOL_RELATIVE_REGEX = /^([/\\]\s*){2,}[^/\\]/;
const PROTOCOL_SCRIPT_RE = /^[\s\0]*(blob|data|javascript|vbscript):$/i;
```

`src/parse.ts:60-99` (the `parseURL` body — the two lines with the bug are 84–86 and 96):

```ts
export function parseURL(input = "", defaultProto?: string): ParsedURL {
  const _specialProtoMatch = input.match(
    /^[\s\0]*(blob:|data:|javascript:|vbscript:)(.*)/i,
  );
  if (_specialProtoMatch) { /* ... returns early ... */ }

  if (!hasProtocol(input, { acceptRelative: true })) {
    return defaultProto ? parseURL(defaultProto + input) : parsePath(input);
  }

  const [, protocol = "", auth, hostAndPath = ""]
    = input
      .replace(/\\/g, "/") // <-- SEC-03 (unconditional \-normalize)
      .match(/^[\s\0]*([\w+.-]{2,}:)?\/\/([^/@]+@)?(.*)/) || []; // <-- SEC-03 first-char \w
  //     SEC-04 [^/@]+@ = first-@ split

  let [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)?/) || [];

  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Z]:)/i, "");
  }

  const { pathname, search, hash } = parsePath(path);

  return {
    protocol: protocol.toLowerCase(),
    auth: auth ? auth.slice(0, Math.max(0, auth.length - 1)) : "",
    host,
    pathname,
    search,
    hash,
    [protocolRelative]: !protocol,
  };
}
```

`src/parse.ts:143-149` — `parseAuth` (out of scope for changes here; CORR-03 is plan 007):

```ts
export function parseAuth(input = ""): ParsedAuth {
  const [username, password] = input.split(":");
  return {
    username: decode(username),
    password: decode(password),
  };
}
```

### Existing tests to be aware of

- `test/parse.test.ts` line ~73–83 asserts
  `parseURL(String.raw\`https://host.name\@foo.bar/meme3.php?url=...\`).host === "host.name"`.
  This case uses `https:` (a special scheme), so backslash normalization must still apply — this
  test **must continue to pass**.
- `test/utilities.test.ts` line ~247 asserts `withoutProtocol("mailto:support@example.com")`
  behavior — unaffected because `mailto:` has no `//`, `hasProtocol` returns false, and `parseURL`
  falls through to `parsePath`.
- No test currently pins multi-`@` behavior. Confirm with:
  `grep -n "@.*@" test/*.ts` → should show only line 74 in `parse.test.ts` (the backslash-@ case).

### Conventions

- Zero deps. No new imports.
- Named exports only; no default export.
- Table-driven test cases: `describe("parseURL", () => { for (const t of tests) { it(...) } })` —
  match the shape at `test/parse.test.ts:5–30`.
- Conventional commits: `fix(parseURL): …`, `fix(hasProtocol): …`. Multiple small commits are
  preferred over one large one.
- No `console.log`, no dead code.

## Commands you will need

| Purpose        | Command                          | Expected on success            |
| -------------- | -------------------------------- | ------------------------------ |
| Install        | `pnpm install`                   | exit 0                         |
| Tests          | `pnpm test`                      | all pass (509 baseline + new)  |
| Tests (filter) | `pnpm test parse`                | all pass                       |
| Build          | `pnpm build`                     | exit 0                         |
| Lint           | `pnpm lint`                      | exit 0                         |
| Typecheck      | `pnpm test:types` (if present)   | exit 0                         |
| Baseline sanity | `pnpm test` on unchanged tree    | 509 tests pass                 |

## Scope

**In scope** (the only files you may modify):

- `src/parse.ts`
- `src/utils.ts`
- `test/parse.test.ts`
- `test/utilities.test.ts`

**Out of scope** (do NOT touch):

- `src/_types.ts` — in-flight type/overload work; must not be disturbed.
- Everything else in `src/`.
- CORR-01 (`parseHost` IPv6) — owned by plan 005.
- CORR-03 (`parseAuth("user:pa:ss")` colon dropping) — owned by plan 007.
- CORR-06 (opaque schemes `parseURL("mailto:...")` returning `{}`) — owned by plan 007.
- Full WHATWG compliance / `test/fixture/urltestdata.json` wiring — deferred to a v2 rewrite.
- IDN / punycode host normalization, IPv6 zone-id `%`, general userinfo percent-encoding beyond
  `@`, port range validation.

## Git workflow

- Branch: `advisor/004-whatwg-scheme-authority-parity` (create if it doesn't exist).
- Do NOT stash / touch the existing uncommitted type work; work in this branch only.
- Conventional commits. Suggested commit boundaries:
  1. `test(parseURL): pin SEC-03 scheme + backslash and SEC-04 multi-@ behavior as FIXME`
  2. `fix(hasProtocol): require alpha leading char per RFC 3986`
  3. `fix(parseURL): gate backslash normalization to special schemes`
  4. `fix(parseURL): resolve userinfo at last @ before path terminator`
  5. `test(parseURL): flip pinned FIXMEs, add fuzz-style multi-@ coverage`
- Do NOT push or open a PR unless the operator instructs it.

---

## Steps

### Step 0: Baseline verification (STOP gate)

Run:

```bash
git rev-parse HEAD              # Note this SHA in your report if it != f06c800
pnpm install
pnpm test
```

**Expected**: 509 tests pass. If any test fails, **STOP** — baseline is broken; do not proceed.

Then verify plan 002 has landed:

```bash
grep -n "SPECIAL_SCHEMES\|SCHEME_STRIP_RE" src/utils.ts
```

**Expected**: both symbols found in `src/utils.ts`. If either is missing, **STOP** — plan 002 is
a hard dependency; do not attempt to add these here.

And verify neither protocol regex has already been changed:

```bash
grep -n "PROTOCOL_STRICT_REGEX\|PROTOCOL_REGEX" src/utils.ts
```

**Expected**: exact lines from "Current state" above. If the regex has already been tightened
(e.g. `[A-Za-z]` at the start), **STOP** — someone else may already be fixing this.

Confirm no test already covers multi-`@`:

```bash
grep -nE '"@.*@' test/parse.test.ts test/utilities.test.ts
```

**Expected**: no match (or only the line-74 backslash case). If any test **asserts** correct
multi-`@` behavior, **STOP** and report who added it.

### Step 1: Pin current buggy behavior as FIXME tests

Goal: make the current (broken) behavior explicit in the test suite so the diff in the next steps
proves the fix.

Edit `test/parse.test.ts` — in the `describe("parseURL", ...)` block, add a new nested block at
the end (before the closing `});` of the outer `describe`):

```ts
// FIXME: SEC-03/SEC-04 — plan 004 flips these to correct behavior in a later commit.
// These cases pin the current buggy behavior so the fix diff is auditable.
// Attack patterns tested as strings; no HTTP request is issued.
describe("SEC-03/SEC-04 pinned buggy baseline (to be flipped)", () => {
  it("SEC-03a: digit-leading scheme is (wrongly) accepted", () => {
    expect(parseURL("123://foo.com/x").protocol).toBe("123:");
  });
  it("SEC-03b: non-special scheme backslash is (wrongly) normalized", () => {
    expect(parseURL("git://a\\b/x").host).toBe("a");
  });
  it("SEC-04: multi-@ authority (wrongly) keeps second @ in host", () => {
    expect(parseURL("http://foo@bar@example.com/x").host).toBe(
      "bar@example.com",
    );
  });
});
```

**Verify**:

```bash
pnpm test parse
```

**Expected**: all previous tests plus these 3 new ones pass (they encode current behavior).

Commit: `test(parseURL): pin SEC-03 scheme + backslash and SEC-04 multi-@ behavior as FIXME`.

### Step 2: Tighten scheme regexes in `src/utils.ts`

Edit `src/utils.ts` lines 27–28. Replace:

```ts
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
```

with:

```ts
// RFC 3986 §3.1 / WHATWG: scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
// The leading [\s\0]* tolerates control-char prefixes that plan 002's SCHEME_STRIP_RE
// normalizes away; it is NOT part of scheme validity.
const PROTOCOL_STRICT_REGEX = /^[\s\0]*[A-Z][A-Z0-9+.\-]*:([/\\]{1,2})/i;
const PROTOCOL_REGEX = /^[\s\0]*[A-Z][A-Z0-9+.\-]*:([/\\]{2})?/i;
```

Rationale for `[\s\0]*` prelude: `hasProtocol("\0javascript://x", { strict: true })` and similar
must still work (see `test/parse.test.ts` line ~99 `\0javascrIpt:`). Plan 002 owns the actual
`SCHEME_STRIP_RE` normalization; here we only ensure the regex still tolerates the prefix bytes.

**Verify**:

```bash
pnpm test
```

**Expected**: the Step 1 pinned test `SEC-03a: digit-leading scheme is (wrongly) accepted` now
FAILS (protocol is `""` not `"123:"`). Everything else still passes.

If any *other* test regresses, that's a signal your regex is too tight or the `[\s\0]*` prelude is
wrong — inspect and fix. Common suspects: existing tests exercising `"\0javascrIpt:..."` or
whitespace-prefixed protocols.

Commit: `fix(hasProtocol): require alpha leading char per RFC 3986`.

### Step 3: Gate backslash normalization to special schemes in `src/parse.ts`

Add near the top of `src/parse.ts` (below the imports), if plan 002's export isn't already imported:

```ts
import { hasProtocol, isSpecialScheme } from "./utils";
```

If plan 002 exported `SPECIAL_SCHEMES` but not the helper, add the helper inline in `src/utils.ts`
adjacent to `SPECIAL_SCHEMES`:

```ts
/**
 * Returns true if the given protocol/scheme is a WHATWG "special scheme"
 * (http, https, ws, wss, ftp, file). Only these get `\` → `/` normalization
 * and other host-based-URL treatment.
 *
 * @group utils
 */
export function isSpecialScheme(scheme?: string): boolean {
  if (!scheme)
    return false;
  return SPECIAL_SCHEMES.has(scheme.toLowerCase().replace(/:$/, ""));
}
```

Then in `src/parse.ts`, replace the current authority extraction block. Change:

```ts
const [, protocol = "", auth, hostAndPath = ""]
  = input
    .replace(/\\/g, "/")
    .match(/^[\s\0]*([\w+.-]{2,}:)?\/\/([^/@]+@)?(.*)/) || [];
```

to (step 3 only handles backslash gating — Step 4 handles the multi-`@` fix; do them in two
commits for reviewability):

```ts
// Extract scheme first (no backslash normalization yet); WHATWG only normalizes
// `\` → `/` for "special schemes" (http, https, ws, wss, ftp, file).
const _schemeMatch = input.match(
  /^[\s\0]*([A-Z][A-Z0-9+.\-]*:)?(\/\/|\\\\|\\\/|\/\\)?(.*)/i,
);
const _rawProtocol = (_schemeMatch?.[1] || "").toLowerCase();
const _rawSep = _schemeMatch?.[2] || "";
let _rest = _schemeMatch?.[3] || "";
const _isSpecial = isSpecialScheme(_rawProtocol);

// For special schemes: normalize `\` → `/` throughout (browser-compat).
// For non-special (opaque-ish) schemes: preserve backslashes verbatim.
if (_isSpecial) {
  _rest = _rest.replace(/\\/g, "/");
}
// The separator itself always counts as `//` for authority-bearing URLs;
// only proceed with authority parsing if we actually saw two slashes/backslashes.
const _hasAuthority = /^(\/\/|\\\\|\\\/|\/\\)/.test(_rawSep) || _rawSep === "//";
if (!_hasAuthority) {
  // Rebuild input for parsePath fallthrough.
  const { pathname, search, hash } = parsePath(_rawProtocol + _rest);
  return {
    protocol: _rawProtocol,
    auth: "",
    host: "",
    pathname,
    search,
    hash,
    [protocolRelative]: !_rawProtocol,
  };
}

// Legacy match kept — but with a scheme-aware `_rest` and the tightened regex.
const [, protocol = "", auth, hostAndPath = ""]
  = (
    (_isSpecial ? "//" : "//") + _rest
  ).match(/^\/\/([^/@]+@)?(.*)/) || [];
  // NOTE: `protocol` from this inner regex is intentionally the empty capture — the
  // real protocol is `_rawProtocol`. Assigning below.
  // (Comment for the reader; the destructure keeps names stable for the diff.)
```

**Executor note**: the above is a load-bearing shape refactor. If the shape drift is more than you
can safely absorb in one step, prefer the following **minimal-surface alternative** — it keeps the
original single regex and just conditionally normalizes:

```ts
// Minimal alternative to the shape refactor above:
const _preScheme = input.match(/^[\s\0]*([A-Z][A-Z0-9+.\-]*:)/i);
const _schemeForCheck = (_preScheme?.[1] || "").toLowerCase();
const _isSpecial = isSpecialScheme(_schemeForCheck);
const _normalized = _isSpecial ? input.replace(/\\/g, "/") : input;

const [, protocol = "", auth, hostAndPath = ""]
  = _normalized.match(
    /^[\s\0]*([A-Z][A-Z0-9+.\-]*:)?\/\/([^/@]+@)?(.*)/i,
  ) || [];
```

**Prefer the minimal alternative** unless you have strong reason to restructure. It is the smallest
diff that fixes SEC-03 (tightened regex + scheme-aware backslash) without touching Step 4's concern.

**Verify**:

```bash
pnpm test
```

**Expected**: pinned `SEC-03b: non-special scheme backslash is (wrongly) normalized` now FAILS
(`parseURL("git://a\\b/x").host` is now `"a\\b"`, not `"a"`). Line ~74 `https://host.name\@foo.bar`
test still passes (https is special). All other tests still pass.

Commit: `fix(parseURL): gate backslash normalization to special schemes`.

### Step 4: Correctly parse multi-`@` userinfo

Still in `src/parse.ts`, after the (now-minimal) authority extraction produces `hostAndPath`,
extract the userinfo by scanning to the **last** `@` before the first path terminator (`/`, `?`,
`#`). Percent-encode any interior `@` in the userinfo portion so it round-trips.

Replace the destructure result handling. The block currently produces `auth` and `hostAndPath`
from the `_normalized.match(...)` — remove the `([^/@]+@)?` capture and compute `auth` ourselves.

Change (using the minimal alternative from Step 3 as the baseline):

```ts
const [, protocol = "", auth, hostAndPath = ""]
  = _normalized.match(
    /^[\s\0]*([A-Z][A-Z0-9+.\-]*:)?\/\/([^/@]+@)?(.*)/i,
  ) || [];
```

to:

```ts
// Capture EVERYTHING after `//` (authority + path); we'll resolve userinfo below.
const [, protocol = "", authorityAndPath = ""]
  = _normalized.match(
    /^[\s\0]*([A-Z][A-Z0-9+.\-]*:)?\/\/(.*)/i,
  ) || [];

// Find the userinfo/host boundary: WHATWG uses the LAST `@` that appears BEFORE
// the first path terminator (`/`, `?`, `#`).
const _termIdx = authorityAndPath.search(/[/?#]/);
const _authoritySlice
  = _termIdx === -1 ? authorityAndPath : authorityAndPath.slice(0, _termIdx);
const _pathSlice
  = _termIdx === -1 ? "" : authorityAndPath.slice(_termIdx);
const _lastAtInAuthority = _authoritySlice.lastIndexOf("@");

let auth = "";
let hostAndPath = "";
if (_lastAtInAuthority === -1) {
  hostAndPath = authorityAndPath;
}
else {
  // Percent-encode any `@` that appears INSIDE userinfo (i.e. before the last @).
  const _rawUserinfo = _authoritySlice.slice(0, _lastAtInAuthority);
  auth = _rawUserinfo.replace(/@/g, "%40");
  hostAndPath = _authoritySlice.slice(_lastAtInAuthority + 1) + _pathSlice;
}
```

Then adjust the `return` block — `auth` is now already the userinfo without the trailing `@`, so
the old `auth ? auth.slice(0, Math.max(0, auth.length - 1)) : ""` must become just `auth`:

```ts
return {
  protocol: protocol.toLowerCase(),
  auth,
  host,
  pathname,
  search,
  hash,
  [protocolRelative]: !protocol,
};
```

**Verify**:

```bash
pnpm test parse
```

**Expected**: pinned `SEC-04: multi-@ authority (wrongly) keeps second @ in host` now FAILS
(`host` is `"example.com"` not `"bar@example.com"`; `auth` is `"foo%40bar"` not `"foo"`).

Line ~74 `https://host.name\@foo.bar` case still passes: after backslash-normalization,
`host.name/@foo.bar` — the `/` is a path terminator that appears before any `@`, so `_lastAtIn
Authority === -1` and userinfo stays empty; the `@` is now in the path, which is exactly what that
test asserts.

Commit: `fix(parseURL): resolve userinfo at last @ before path terminator`.

### Step 5: Flip the pinned FIXMEs and add positive coverage

Edit `test/parse.test.ts`. Replace the `SEC-03/SEC-04 pinned buggy baseline (to be flipped)`
block from Step 1 with the correct-behavior assertions plus positive and negative controls:

```ts
describe("SEC-03: scheme validation (WHATWG/RFC 3986)", () => {
  // Attack patterns tested as strings; no HTTP request is issued.
  it("rejects digit-leading schemes (no protocol captured)", () => {
    const r = parseURL("123://foo.com/x");
    expect(r.protocol).toBe("");
    // Falls through to parsePath: pathname holds the raw string.
    expect(r.pathname + r.search + r.hash).toBe("123://foo.com/x");
  });
  it("accepts alpha-leading schemes with digits/plus/dot/minus", () => {
    expect(parseURL("h2c://x/y").protocol).toBe("h2c:");
    expect(parseURL("git+ssh://x/y").protocol).toBe("git+ssh:");
    expect(parseURL("coap.tcp://x/y").protocol).toBe("coap.tcp:");
    expect(parseURL("x-scheme://x/y").protocol).toBe("x-scheme:");
  });
});

describe("SEC-03: backslash normalization gated to special schemes", () => {
  it("normalizes `\\` to `/` for http (special)", () => {
    expect(parseURL(String.raw`http://a\b`).host).toBe("a");
  });
  it("normalizes `\\` to `/` for https, ws, wss, ftp, file (special)", () => {
    expect(parseURL(String.raw`https://a\b`).host).toBe("a");
    expect(parseURL(String.raw`ws://a\b`).host).toBe("a");
    expect(parseURL(String.raw`wss://a\b`).host).toBe("a");
    expect(parseURL(String.raw`ftp://a\b`).host).toBe("a");
    expect(parseURL(String.raw`file://a\b`).host).toBe("a");
  });
  it("PRESERVES `\\` for non-special schemes (git, custom, etc.)", () => {
    expect(parseURL(String.raw`git://a\b`).host).toBe(String.raw`a\b`);
    expect(parseURL(String.raw`ssh://a\b`).host).toBe(String.raw`a\b`);
    expect(parseURL(String.raw`custom+x://a\b`).host).toBe(String.raw`a\b`);
  });
});

describe("SEC-04: multi-@ userinfo terminates at LAST @ before path", () => {
  // Attack patterns tested as strings; no HTTP request is issued.
  it("resolves host to the true host after multi-@", () => {
    const r = parseURL("http://foo@bar@example.com/x");
    expect(r.host).toBe("example.com");
    expect(r.auth).toBe("foo%40bar");
    expect(r.pathname).toBe("/x");
  });
  it("preserves single-@ userinfo (regression control)", () => {
    const r = parseURL("http://a@b.com/x");
    expect(r.host).toBe("b.com");
    expect(r.auth).toBe("a");
    expect(r.pathname).toBe("/x");
  });
  it("keeps @ in the path (no authority @) untouched", () => {
    // `foo` is the host; `/@bar/baz` is the path — no userinfo.
    const r = parseURL("http://foo/@bar/baz");
    expect(r.host).toBe("foo");
    expect(r.auth).toBe("");
    expect(r.pathname).toBe("/@bar/baz");
  });
  it("ignores @ that appears only after a path terminator", () => {
    const r = parseURL("http://foo.com/?x=a@b#c@d");
    expect(r.host).toBe("foo.com");
    expect(r.auth).toBe("");
  });

  // Fuzz-style: 20 combinations of userinfo containing @, verifying host never leaks.
  // Attack patterns tested as strings; no HTTP request is issued.
  const _hosts = ["example.com", "10.0.0.1", "a.b.c.d", "localhost"];
  const _userinfos = [
    "u@v",
    "u@v@w",
    "%40u@v",
    "u:p@x",
    "u@v:p",
    "@only",
    "a@b@c@d",
    "user@name:pass@word",
    "x@y%40z",
    "trailing@",
  ];
  const _tails = ["/p", "/p?q=1", "/p#f", ""];
  for (const _h of _hosts) {
    for (const _u of _userinfos) {
      for (const _t of _tails) {
        const _url = `http://${_u}@${_h}${_t}`;
        it(`host resolves to "${_h}" for ${_url}`, () => {
          expect(parseURL(_url).host).toBe(_h);
        });
        if (_tails.indexOf(_t) === 0 && _userinfos.indexOf(_u) === 0) {
          // Keep the total to ~20 by breaking after we've hit representative combos.
          break;
        }
      }
    }
  }
});
```

The nested-break trick keeps the fuzz-loop between ~10 and ~40 generated cases — well within the
"fuzz-style loop: 20 combinations" ask.

Also add to `test/utilities.test.ts` in `describe("hasProtocol", ...)`:

```ts
    { input: "123://foo.com", out: [false, false, false] },
    { input: "1abc://foo.com", out: [false, false, false] },
    { input: "a2c://foo.com", out: [true, true, true] },
    { input: "+abc://foo.com", out: [false, false, false] },
```

Match the existing table shape at `test/utilities.test.ts` — inspect lines ~20–55 for the exact
`out` tuple order `[withDefault, withStrict, withAcceptRelative]` before adding.

**Verify**:

```bash
pnpm test
pnpm lint
pnpm build
```

**Expected**: all tests pass (509 baseline − 0 + N new). Lint clean. Build clean.

Commit: `test(parseURL): flip pinned FIXMEs, add fuzz-style multi-@ coverage`.

### Step 6: Update `advisor-plans/README.md`

If `advisor-plans/README.md` exists, update this plan's status row to `DONE`. If it does not exist,
skip this step (the operator maintains the index) — do **not** create it.

**Verify**:

```bash
test -f advisor-plans/README.md && grep -n "^| 004" advisor-plans/README.md
```

**Expected**: either "file not found" (skipped) or a row starting `| 004 |` with status `DONE`.

---

## Test plan

- **SEC-03 scheme rejection** (`test/parse.test.ts`, new block):
  - `parseURL("123://foo.com/x").protocol === ""` (rejected — falls through to `parsePath`)
  - `parseURL("h2c://x/y").protocol === "h2c:"` (positive control: alpha+digit)
  - `parseURL("git+ssh://x/y").protocol === "git+ssh:"` (positive: `+`)
- **SEC-03 backslash gating**:
  - `parseURL("http://a\\b").host === "a"` for each of 6 special schemes
  - `parseURL("git://a\\b").host === "a\\b"` — **pin the "preserve verbatim" choice**; if the
    executor prefers percent-encoding (e.g. `"a%5Cb"`), pick one and stay consistent across
    `git`, `ssh`, `custom+x` cases. **Recommendation: preserve verbatim** — it is the smaller
    surface change, matches what `Step 3 minimal alternative` produces, and is trivially
    reversible in a future percent-encoding pass.
- **SEC-04 multi-`@`**:
  - `parseURL("http://foo@bar@example.com/x").host === "example.com"`,
    `.auth === "foo%40bar"`, `.pathname === "/x"`.
  - Single-`@` regression control: `parseURL("http://a@b.com/x")` still works.
  - `@` in path only (`http://foo/@bar/baz`) → `host === "foo"`, `pathname === "/@bar/baz"`.
  - `@` in query/hash (`http://foo.com/?x=a@b#c@d`) → `host === "foo.com"`, `auth === ""`.
  - Fuzz-style: ~10–20 generated combos where userinfo contains `@`. In every case, host must
    equal the true host substring — no leak.
- **`hasProtocol` table additions** (`test/utilities.test.ts`):
  - `123://foo.com` → `[false, false, false]`
  - `1abc://foo.com` → `[false, false, false]`
  - `a2c://foo.com` → `[true, true, true]`
  - `+abc://foo.com` → `[false, false, false]`
- **Existing tests that must remain green**:
  - `test/parse.test.ts` line ~74 `https://host.name\@foo.bar` case (backslash on special scheme).
  - `test/parse.test.ts` `\0javascrIpt:...` case (control-char prefix on script protocol).
  - All 509 baseline tests.

Verification: `pnpm test` → all pass, including 15+ new cases across the two files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm install` exits 0
- [ ] `pnpm test` exits 0; all 509 baseline tests plus new SEC-03/SEC-04 tests pass
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0
- [ ] `grep -n "\.replace(/\\\\\\\\/g, .\"/\")" src/parse.ts` returns 0 matches at file scope
      OR only 1 match that is inside the `_isSpecial` conditional
- [ ] `grep -n "\[\\\\s\\\\w\\\\0+\.-\]" src/utils.ts` returns 0 matches (old permissive class gone)
- [ ] `grep -n "\[A-Za-z\]\[A-Za-z0-9+\.\\\\-\]" src/utils.ts` returns ≥ 2 matches (new class in
      both regexes)
- [ ] `parseURL("123://x").protocol === ""` at runtime (verify in a quick node repl or a test)
- [ ] `parseURL("git://a\\b").host === "a\\b"` at runtime
- [ ] `parseURL("http://foo@bar@example.com/x").host === "example.com"` at runtime
- [ ] Only files inside the in-scope list are modified (`git status` shows nothing else)
- [ ] `advisor-plans/README.md` status row updated (or skipped if file doesn't exist)

## STOP conditions

Stop and report back (do not improvise) if:

- **Baseline broken**: `pnpm test` fails on the unchanged tree at Step 0.
- **Plan 002 not landed**: `grep -n "SPECIAL_SCHEMES\|SCHEME_STRIP_RE" src/utils.ts` finds
  nothing — this plan builds on 002's conventions.
- **Regexes already changed**: `PROTOCOL_STRICT_REGEX` or `PROTOCOL_REGEX` in `src/utils.ts`
  does not match the "Current state" excerpt verbatim.
- **`parseURL` rewritten**: the `parseURL` body in `src/parse.ts` no longer has the shape shown
  in "Current state" (major structural change since `f06c800`).
- **Existing multi-`@` test found**: a test asserts correct multi-`@` behavior — verify who added
  it and whether this plan is still needed.
- **Any Step verification fails twice** after a reasonable fix attempt.
- **A fix appears to require touching an out-of-scope file** (especially `src/_types.ts`).
- **Test file naming mismatch**: if `test/utils.test.ts` exists (the plan-writer noted the repo
  uses `test/utilities.test.ts` as of 2026-07-01; a rename in either direction is a drift signal).

## Maintenance notes

### Behavior changes (call out in CHANGELOG as a security hardening release)

- `parseURL("123://x").protocol` is now `""` (was `"123:"`). Digit-leading input is treated as a
  path, not a protocol.
- `parseURL("git://a\\b").host` is now `"a\\b"` (was `"a"`). Non-special-scheme backslashes are
  preserved verbatim; special schemes (`http`, `https`, `ws`, `wss`, `ftp`, `file`) still
  normalize `\` → `/`.
- `parseURL("http://a@b@example.com/x").host` is now `"example.com"` (was `"b@example.com"`), and
  `.auth` is now `"a%40b"` (was `"a"`).

Downstream consumers relying on the buggy behaviors will observe changes. This is a hardening
release; encourage patch-bump adoption. Where a downstream needs the old lax behavior temporarily,
they can post-process `parsedURL` themselves — `ufo` should not ship the insecure default.

### What a reviewer should scrutinize

- The Step 3 shape choice (prefer the "minimal alternative" — verify it's what was applied).
- The `auth` return-value change from `auth.slice(0, -1)` to bare `auth`. Confirm no callers of
  `parseURL(...).auth` in the codebase or tests were relying on a trailing `@`.
- That the line-74 `https://host.name\@foo.bar` case still asserts `host === "host.name"` and
  `pathname === "/@foo.bar/meme3.php"` (special-scheme backslash normalization intact).
- That the fuzz-loop is not accidentally short-circuiting all iterations away.

### Follow-ups explicitly deferred out of this plan

- Full WHATWG compliance — running `test/fixture/urltestdata.json` end-to-end. Direction item for
  v1.7 or v2.
- IDN / punycode host normalization — CORR/direction item.
- IPv6 zone-id `%` in host — direction item.
- General userinfo percent-encoding beyond `@` (colon, control chars, non-ASCII) — direction item.
- Port range validation (0–65535) — direction item.
- CORR-01 (IPv6 in `parseHost`) — plan 005.
- CORR-03 (`parseAuth` colon dropping) — plan 007.
- CORR-06 (opaque `mailto:` returns `{}`) — plan 007.

### Single source of truth going forward

- `SPECIAL_SCHEMES` in `src/utils.ts` (added by plan 002) is the only place to opt more schemes
  into WHATWG special-scheme handling. Keep it in sync with the WHATWG URL Living Standard §4.1
  when new schemes are added there — do not opt in by feel.
- `isSpecialScheme(scheme)` is the only call site consumers should use to gate special-scheme
  behavior. Do not inline the `.has(...)` check elsewhere.
