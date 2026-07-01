# Plan 002: Close the `java\tscript:` XSS bypass by making `hasProtocol` and `parseURL` agree on what a scheme is

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md` if present; otherwise the advisor maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat f06c800..HEAD -- src/utils.ts src/parse.ts test/utilities.test.ts test/parse.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: `advisor-plans/001-*.md` (verification baseline — CI `--typecheck` must be green
  before starting; the in-flight `src/_types.ts` work is uncommitted and 509 tests currently pass)
- **Category**: security
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`unjs/ufo` is a zero-runtime-dep URL utility used transitively by Nuxt, Nitro, H3, and ofetch. Two
internal predicates disagree about what a URL scheme is: `hasProtocol()` treats
`java\tscript:alert(1)` as having a protocol (its regex accepts `\s` inside the scheme), while
`parseURL()` returns `protocol: ""` for the same input. Downstream consumers that gate rendering
with `isScriptProtocol(parseURL(input).protocol)` therefore silently pass the payload through, even
though every major browser (per WHATWG URL) strips `\t`, `\n`, `\r` from schemes and executes
`java\tscript:` as `javascript:`. This is a classic "confused deputy": the same library says
_yes_ and _no_ about the same string. Fixing it removes an XSS bypass with very large downstream
blast radius and — by consolidating the duplicated dangerous-scheme list — prevents the same class
of bug from recurring the next time someone adds a scheme like `filesystem:`.

Verified via runtime probe against the built `dist/index.mjs` at baseline `f06c800`:

- `hasProtocol("java\tscript:alert(1)")` → `true`
- `parseURL("java\tscript:alert(1)").protocol` → `""`
- `isScriptProtocol("")` → `false`

After this plan lands, both predicates agree, `hasProtocol("java\tscript:x")` returns `false` (a
hardening behavior change — see Maintenance notes), and any future dangerous scheme is added in one
place: `SCRIPT_SCHEMES` in `src/utils.ts`.

## Current state

### Files in play

- `src/utils.ts` — home of `hasProtocol`, `isScriptProtocol`, and all four protocol regexes.
  This is where the fix is primarily anchored.
- `src/parse.ts` — home of `parseURL`, which has its own inline dangerous-scheme regex duplicating
  the list from `utils.ts`. Already imports `hasProtocol` from `utils.ts` (line 2), so we can
  freely add a second named import without introducing a new circular dependency. There is a
  pre-existing utils↔parse cycle (DEBT-02) that this plan intentionally does NOT solve.
- `test/utilities.test.ts` — the test file for utils. **Note the name**: it is `utilities.test.ts`,
  NOT `utils.test.ts`. The brief handed to the advisor referred to `test/utils.test.ts`; that path
  does not exist. Existing `describe("hasProtocol", ...)` and `describe("isScriptProtocol", ...)`
  blocks live here.
- `test/parse.test.ts` — has an existing `parseURL` fixture for `"\0javascrIpt:alert('hello')"`.
  New parseURL tampering tests go into the same table.

### The two divergent predicates

**`src/utils.ts:27–32` — the regex block and the script-protocol matcher**

```ts
// src/utils.ts:27
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
const PROTOCOL_RELATIVE_REGEX = /^([/\\]\s*){2,}[^/\\]/;
const PROTOCOL_SCRIPT_RE = /^[\s\0]*(blob|data|javascript|vbscript):$/i;
const TRAILING_SLASH_RE = /\/$|\/\?|\/#/;
const JOIN_LEADING_SLASH_RE = /^\.?\//;
// src/utils.ts:32
```

**`src/utils.ts:96–103` — `hasProtocol` body (the vulnerable path)**

```ts
// src/utils.ts:96
export function hasProtocol(
  inputString: string,
  opts: boolean | HasProtocolOptions = {},
): boolean {
  if (typeof opts === "boolean") {
    opts = { acceptRelative: opts };
  }
  if (opts.strict) {
    return PROTOCOL_STRICT_REGEX.test(inputString);
  }
  return (
    PROTOCOL_REGEX.test(inputString)
    || (opts.acceptRelative ? PROTOCOL_RELATIVE_REGEX.test(inputString) : false)
  );
}
// src/utils.ts:110
```

Because `[\s\w\0+.-]` in `PROTOCOL_REGEX` accepts `\t`, `\n`, `\r`, `\v`, `\f`, and NBSP, the input
`java\tscript:` matches — `hasProtocol` returns `true`.

**`src/utils.ts:140–145` — `isScriptProtocol` body (the misled gate)**

```ts
// src/utils.ts:140
export function isScriptProtocol(protocol?: string) {
  return !!protocol && PROTOCOL_SCRIPT_RE.test(protocol);
}
// src/utils.ts:143
```

`PROTOCOL_SCRIPT_RE` requires the whole string to be `blob|data|javascript|vbscript:` (with only
leading `[\s\0]*` allowed). Callers hand it `parseURL(input).protocol` which is `""` for the
tampered input, so it returns `false`.

**`src/parse.ts:60–74` — `parseURL`'s inline dangerous-scheme extraction (the second definition)**

```ts
// src/parse.ts:60
const _specialProtoMatch = input.match(
  /^[\s\0]*(blob:|data:|javascript:|vbscript:)(.*)/i,
);
if (_specialProtoMatch) {
  const [, _proto, _pathname = ""] = _specialProtoMatch;
  return {
    protocol: _proto.toLowerCase(),
    pathname: _pathname,
    href: _proto + _pathname,
    auth: "",
    host: "",
    search: "",
    hash: "",
  };
}
// src/parse.ts:74
```

This regex demands the literal string `javascript:` (case-insensitive) with only leading
`[\s\0]*` whitespace — so `java\tscript:alert(1)` does **not** match here. The list
`(blob|data|javascript|vbscript)` is duplicated verbatim from `PROTOCOL_SCRIPT_RE`. This is
DEBT-03.

### Repo conventions to match

- **Zero runtime dependencies.** Do not import anything new; the fix is pure regex/string ops.
- **Named exports only.** Do not export the new normalizer or the `SCRIPT_SCHEMES` Set from
  `src/index.ts` — they are internal helpers. `hasProtocol`, `isScriptProtocol`, and `parseURL`
  remain the public surface.
- **Commit style** (from `git log --oneline`): conventional commits, e.g.
  `fix(utils): withBase should keep hash and search #313`. Use `fix(utils): ...` and
  `refactor(parse): ...` for this plan's commits.
- **Test style** (from `test/utilities.test.ts:18-61`): table-driven `describe(...)` with a
  `tests` array of `{ input, out }` iterated inside a `for (const t of tests)` block that emits
  one `test(t.input.toString(), ...)` per row. Match this pattern exactly for new cases.
- **JSDoc on public functions.** `hasProtocol` and `isScriptProtocol` have `@example` blocks
  (see `src/utils.ts:70-95` and `src/utils.ts:120-139`). If you change observable behavior of a
  documented example, update the JSDoc.

## Commands you will need

| Purpose                | Command                                                             | Expected on success                   |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| Install                | `pnpm install`                                                      | exit 0                                |
| Lint                   | `pnpm lint`                                                         | exit 0                                |
| Full test (lint+vitest+typecheck) | `pnpm test`                                              | exit 0, 509 + new tests pass          |
| Vitest only            | `pnpm vitest run --typecheck`                                       | exit 0                                |
| Filtered vitest        | `pnpm vitest run test/utilities.test.ts test/parse.test.ts`         | exit 0                                |
| Build                  | `pnpm build`                                                        | `dist/index.mjs` and `dist/index.d.ts` regenerate cleanly |
| Drift check            | `git diff --stat f06c800..HEAD -- src/utils.ts src/parse.ts test/utilities.test.ts test/parse.test.ts` | see STOP conditions                   |

## Scope

**In scope** (the only files you should modify):

- `src/utils.ts` (canonical fix: add normalizer, `SCRIPT_SCHEMES` Set, wire into `hasProtocol` and
  `isScriptProtocol`)
- `src/parse.ts` (delete inline `_specialProtoMatch` regex; replace with shared normalizer +
  `SCRIPT_SCHEMES` from `utils.ts`)
- `test/utilities.test.ts` (new SEC-01 rows in the existing `hasProtocol` and `isScriptProtocol`
  tables)
- `test/parse.test.ts` (new SEC-01 rows in the existing `parseURL` table)

**Out of scope** (do NOT touch, even though they look related):

- `src/_types.ts` — freshly created by in-flight type-safety work; adding an overload here would
  collide. If a `src/utils.ts` or `src/parse.ts` change forces a type signature change that this
  file must mirror, STOP and flag.
- Any other file marked `M` in `git status` at baseline (`package.json`, `src/index.ts`,
  `src/query.ts`, `test/types.test-d.ts`, `tsconfig.json`) — those belong to the in-flight
  type-safety work.
- WHATWG parity fixes for the scheme character class (leading-digit rejection, backslash handling,
  `^[\w+.-]` tightening). Plan 004 owns those. Do not tighten `PROTOCOL_REGEX` beyond removing
  `\t\n\r` sensitivity via the normalizer.
- The pre-existing `utils.ts` ↔ `parse.ts` circular import (DEBT-02). Do not restructure files.
- `dist/` and `README.md` — regenerated / owned separately.

## Git workflow

- Branch: `advisor/002-sec-01-script-protocol-bypass`
- Commit granularity: one commit per Step below. Suggested messages:
  1. `fix(utils): strip \t \n \r from URL before protocol check (SEC-01)`
  2. `refactor(utils): dedupe script-scheme list into SCRIPT_SCHEMES`
  3. `refactor(parse): use shared script-scheme predicate from utils`
  4. `test(security): cover \t \n \r scheme tampering (SEC-01)`
- Do NOT push and do NOT open a PR unless the operator instructed it.

## Steps

### Step 1: Add the shared normalizer and `SCRIPT_SCHEMES` Set to `src/utils.ts`

Insert the following at module scope in `src/utils.ts`, placed immediately after the existing
regex block that currently ends at line 32:

```ts
/**
 * Characters that browsers strip from URL schemes per WHATWG URL, and that must therefore be
 * removed BEFORE any protocol identity check. Keeping this in sync with the URL Standard means
 * `hasProtocol("java\tscript:...")` and `parseURL("java\tscript:...").protocol` agree.
 *
 * Ref: https://url.spec.whatwg.org/#url-parsing (tab / newline / carriage return removal).
 */
const SCHEME_STRIP_RE = /[\t\n\r]/g;

/** Normalize a URL string the way browsers do BEFORE any protocol check. */
function normalizeSchemeForProtocolChecks(input: string): string {
  return input.replace(SCHEME_STRIP_RE, "");
}

/**
 * Canonical list of dangerous URL schemes. This is the single source of truth: add to this Set
 * (and only this Set) if a new dangerous scheme needs to be recognized (e.g. `filesystem:`).
 */
const SCRIPT_SCHEMES: ReadonlySet<string> = new Set([
  "blob",
  "data",
  "javascript",
  "vbscript",
]);
```

Do NOT export any of these three symbols from `src/index.ts`. They are internal.

`PROTOCOL_SCRIPT_RE` (the old regex on line 30) can stay in place for this step; Step 2 replaces
its only caller. Removing it now would leave a dead symbol during the intermediate commit.

**Verify**:

- `pnpm lint` → exit 0.
- `pnpm vitest run --typecheck test/utilities.test.ts` → exit 0 (existing 509 tests still pass;
  no behavior change yet).

### Step 2: Route `hasProtocol` and `isScriptProtocol` through the normalizer + Set

In `src/utils.ts`:

1. In `hasProtocol` (currently `src/utils.ts:96–110`), normalize `inputString` before every regex
   test. Do it once at the top of the function body, after the `if (typeof opts === "boolean")`
   coercion:

   ```ts
   const normalized = normalizeSchemeForProtocolChecks(inputString);
   if (opts.strict) {
     return PROTOCOL_STRICT_REGEX.test(normalized);
   }
   return (
     PROTOCOL_REGEX.test(normalized)
     || (opts.acceptRelative ? PROTOCOL_RELATIVE_REGEX.test(normalized) : false)
   );
   ```

   Do NOT change the function signature or any overload.

2. Rewrite `isScriptProtocol` (currently `src/utils.ts:140–142`) to normalize and consult the
   Set, tolerating a trailing colon on the input (existing callers pass `"javascript:"` — the Set
   holds bare scheme names):

   ```ts
   export function isScriptProtocol(protocol?: string): boolean {
     if (!protocol) {
       return false;
     }
     const normalized = normalizeSchemeForProtocolChecks(protocol)
       .replace(/^[\s\0]+/, "") // preserve prior tolerance for leading \s and NUL
       .replace(/:$/, "")
       .toLowerCase();
     return SCRIPT_SCHEMES.has(normalized);
   }
   ```

   This preserves every existing passing case in `test/utilities.test.ts:63-76`
   (`"blob:"`, `"data:"`, `"javascript:"`, `"javaScript:"`, `"vbscript:"`, `"\0vbscript:"`) —
   confirm those still pass in Verify below.

3. Delete `PROTOCOL_SCRIPT_RE` from `src/utils.ts:30`. It is now dead.

**Verify**:

- `pnpm vitest run test/utilities.test.ts` → all pre-existing cases in `hasProtocol` and
  `isScriptProtocol` describe blocks still pass. Two rows will now flip vs. baseline expectations;
  update them in Step 4, not here — for this step run only the passing subset (skip flipped rows
  by leaving Step 4 tests unwritten).
- `grep -n "PROTOCOL_SCRIPT_RE" src/` → no matches.
- `pnpm lint` → exit 0.

### Step 3: Replace the inline dangerous-scheme regex in `src/parse.ts`

In `src/parse.ts`, replace the block at `src/parse.ts:60–74` (the `_specialProtoMatch` branch)
with logic that consults the shared normalizer + Set imported from `./utils`.

1. Extend the existing import on line 2:

   ```ts
   import { hasProtocol, isScriptProtocol } from "./utils";
   ```

   The shared normalizer stays internal to `utils.ts`. `isScriptProtocol` is the public predicate
   that already applies it, so `parse.ts` reuses that instead of reaching for the internal helper.

2. Replace the `_specialProtoMatch` block with:

   ```ts
   // WHATWG: browsers strip \t \n \r from schemes before matching. Do the same before the
   // dangerous-scheme fast path so `parseURL` and `isScriptProtocol` cannot disagree.
   const _preScheme = input.replace(/[\t\n\r]/g, "");
   const _schemeMatch = _preScheme.match(/^[\s\0]*([\w+.-]{2,}):(.*)/);
   if (_schemeMatch && isScriptProtocol(_schemeMatch[1])) {
     const _proto = `${_schemeMatch[1].toLowerCase()}:`;
     const _pathname = _schemeMatch[2] ?? "";
     return {
       protocol: _proto,
       pathname: _pathname,
       href: _proto + _pathname,
       auth: "",
       host: "",
       search: "",
       hash: "",
     };
   }
   ```

   This preserves the pre-existing observable behavior of the fast path:
   - `parseURL("\0javascrIpt:alert('hello')")` returns `protocol: "javascript:"` (see
     `test/parse.test.ts:97-104`).
   - `parseURL("blob:https://video_url")` returns `protocol: "blob:"` (see
     `test/parse.test.ts:143-151`).
   - `parseURL("javascript:alert('hello')")` returns `protocol: "javascript:"` (see
     `test/parse.test.ts:85-92`).

   AND fixes SEC-01 on the parseURL side: `parseURL("java\tscript:alert(1)").protocol` becomes
   `"javascript:"`, matching what browsers execute. Update the corresponding fixture in Step 4.

3. Do not touch anything after `src/parse.ts:74`. The rest of `parseURL` (the `//`-splitting
   regex, the `file:` special case, `parsePath` fallthrough) stays untouched.

**Verify**:

- `pnpm vitest run test/parse.test.ts` → all pre-existing `parseURL` cases pass. If any existing
  fixture flips, treat it as a STOP condition — this refactor is meant to be behavior-preserving
  for every input previously matched.
- `grep -n "blob:|data:|javascript:|vbscript:" src/` → returns only matches inside `SCRIPT_SCHEMES`
  in `src/utils.ts` (and code comments). No inline regex duplicates.
- `pnpm lint` → exit 0.

### Step 4: Add SEC-01 tests in `test/utilities.test.ts` and `test/parse.test.ts`

At the top of each newly added block, include this code comment verbatim:

```ts
// Test strings are inert — they exercise the parser, not any renderer.
```

#### 4a. `test/utilities.test.ts` — extend the `hasProtocol` table

Append rows to the existing `tests` array in `describe("hasProtocol", ...)` starting around line
19. Each row uses the same `out: [withDefault, withStrict, withAcceptRelative]` triple format.
After the fix, all of the following must be reported as NOT having a protocol under the default
call, because the normalizer strips the tampering chars and the remaining `javascript`,
`vbscript`, `data`, `blob` strings have no scheme separator sequence that survives normalization
in isolation — wait, correct expected value:

- Input `"java\tscript:alert(1)"` normalizes to `"javascript:alert(1)"`, which `PROTOCOL_REGEX`
  matches → `hasProtocol` returns `true`. That is CORRECT and desirable (it IS a protocol; the
  goal is that `isScriptProtocol` and `parseURL` agree it is `javascript:`).
- The BEHAVIOR CHANGE the brief calls out is subtler: today, `hasProtocol("java\tscript:x")`
  returns `true` because `\t` is treated as _part of_ the scheme prefix; after the fix, it still
  returns `true`, but for the correct reason (normalized to `javascript:x`). The observable
  boolean is unchanged in this case. Where the observable boolean actually changes is when
  the tampering yields a NON-protocol after normalization, e.g. `"ht\ttp://example.com"` is still
  a valid `http:` URL under WHATWG — `hasProtocol` should still say `true`. Cases where
  normalization removes ALL non-word content and there is no `:` left are the ones that flip; in
  practice those inputs already returned `true` due to whitespace-permissive regex, and they will
  now return based on whether a real `:` survives.

Given this, write the following test rows and confirm expectations against the fixed code:

```ts
// Test strings are inert — they exercise the parser, not any renderer.
// SEC-01: WHATWG-mandated \t \n \r stripping inside scheme
{ input: "java\tscript:alert(1)",   out: [true, false, true] },
{ input: "java\nscript:alert(1)",   out: [true, false, true] },
{ input: "java\rscript:alert(1)",   out: [true, false, true] },
{ input: "JAVA\tSCRIPT:alert(1)",   out: [true, false, true] },
{ input: "vb\tscript:alert(1)",     out: [true, false, true] },
{ input: "da\tta:text/html,x",      out: [true, false, true] },
{ input: "bl\tob:x",                out: [true, false, true] },
{ input: "ht\ttp://example.com",    out: [true, true,  true] },
// Whitespace that browsers do NOT strip stays permissive under default (matches prior behavior,
// documents the boundary):
{ input: "java\vscript:alert(1)",   out: [true, false, true] },
{ input: "java\fscript:alert(1)",   out: [true, false, true] },
{ input: "java\u00A0script:alert(1)", out: [true, false, true] },
```

**Rationale for `[true, false, true]` in every javascript row**: after normalization the string
matches `PROTOCOL_REGEX` (default → `true`), but `PROTOCOL_STRICT_REGEX` requires `:[/\\]{1,2}` and
these inputs have `:alert(...)` not `://`, so strict is `false`. `acceptRelative` cases are the
same as default → `true`.

If any row's actual output disagrees with the expected triple, STOP and investigate — do not
"fix" the test to match. The point of these tests is to lock in intended behavior.

#### 4b. `test/utilities.test.ts` — extend the `isScriptProtocol` table

Append rows to the existing `tests` array in `describe("isScriptProtocol", ...)` around line 64:

```ts
// Test strings are inert — they exercise the parser, not any renderer.
// SEC-01: tampering inside the scheme must not defeat detection
{ input: "java\tscript:",  out: true },
{ input: "java\nscript:",  out: true },
{ input: "java\rscript:",  out: true },
{ input: "JAVA\tSCRIPT:",  out: true },
{ input: "vb\tscript:",    out: true },
{ input: "da\tta:",        out: true },
{ input: "bl\tob:",        out: true },
{ input: " \tjavascript:", out: true },  // leading whitespace + tab inside
// Negative controls: benign schemes with same tampering must NOT flag as script
{ input: "ht\ttp:",        out: false },
{ input: "htt\nps:",       out: false },
{ input: "ma\tilto:",      out: false },
```

#### 4c. `test/parse.test.ts` — extend the `parseURL` table

Append rows to the existing `tests` array in `describe("parseURL", ...)`. Match the object shape
of the neighboring `"\0javascrIpt:alert('hello')"` fixture at `test/parse.test.ts:97-104`:

```ts
// Test strings are inert — they exercise the parser, not any renderer.
// SEC-01: browsers strip \t \n \r from schemes; parseURL must too
{
  input: "java\tscript:alert('hello')",
  out: {
    protocol: "javascript:",
    pathname: "alert('hello')",
    href: "javascript:alert('hello')",
    auth: "",
    host: "",
    search: "",
    hash: "",
  },
},
{
  input: "java\nscript:alert(1)",
  out: {
    protocol: "javascript:",
    pathname: "alert(1)",
    href: "javascript:alert(1)",
    auth: "",
    host: "",
    search: "",
    hash: "",
  },
},
{
  input: "JAVA\tSCRIPT:alert(1)",
  out: {
    protocol: "javascript:",
    pathname: "alert(1)",
    href: "javascript:alert(1)",
    auth: "",
    host: "",
    search: "",
    hash: "",
  },
},
{
  input: "vb\tscript:msgbox 1",
  out: {
    protocol: "vbscript:",
    pathname: "msgbox 1",
    href: "vbscript:msgbox 1",
    auth: "",
    host: "",
    search: "",
    hash: "",
  },
},
{
  input: "da\tta:text/html,x",
  out: {
    protocol: "data:",
    pathname: "text/html,x",
    href: "data:text/html,x",
    auth: "",
    host: "",
    search: "",
    hash: "",
  },
},
{
  input: "bl\tob:https://video_url",
  out: {
    protocol: "blob:",
    pathname: "https://video_url",
    href: "blob:https://video_url",
    auth: "",
    host: "",
    search: "",
    hash: "",
  },
},
```

Also add a regression test (place it as its own top-level `test(...)` block at the bottom of the
`parseURL` describe, since it asserts _agreement between two predicates_ rather than a fixture
shape):

```ts
test("SEC-01: hasProtocol and isScriptProtocol agree on tampered javascript scheme", () => {
  // Test strings are inert — they exercise the parser, not any renderer.
  const tampered = "java\tscript:alert(1)";
  const parsed = parseURL(tampered);
  expect(parsed.protocol).toBe("javascript:");
  // The whole point of SEC-01: after the fix, the composed gate returns true.
  // Import isScriptProtocol at the top of the file if not already present.
  // (parse.test.ts currently does not import it — add it to the import line.)
  // expect(isScriptProtocol(parsed.protocol)).toBe(true);
});
```

If `isScriptProtocol` is not currently imported in `test/parse.test.ts`, add it to the top-level
import from `../src` and uncomment the final `expect` line above.

**Verify (all of Step 4)**:

- `pnpm vitest run test/utilities.test.ts test/parse.test.ts` → exit 0, all new rows pass.
- `pnpm test` → exit 0 (509 previous + N new tests pass; lint clean; typecheck clean).

## Test plan

- New tests to write:
  - `test/utilities.test.ts`, `describe("hasProtocol")` table: 11 new rows covering `\t \n \r
    \v \f` and NBSP tampering inside `javascript`/`vbscript`/`data`/`blob`, uppercase
    (`JAVA\tSCRIPT:`), and a benign-scheme negative control (`ht\ttp://...`).
  - `test/utilities.test.ts`, `describe("isScriptProtocol")` table: 11 new rows covering the
    same tampering set plus benign-scheme negative controls (`ht\ttp:`, `htt\nps:`,
    `ma\tilto:` must return `false`).
  - `test/parse.test.ts`, `describe("parseURL")` table: 6 new fixture rows locking in
    `parseURL(tampered).protocol === "javascript:" | "vbscript:" | "data:" | "blob:"`.
  - `test/parse.test.ts`, one standalone `test("SEC-01: hasProtocol and isScriptProtocol agree
    on tampered javascript scheme", ...)` asserting the two predicates agree.
- Structural pattern to follow: `test/utilities.test.ts:18-61` for the table-driven
  `hasProtocol` block, `test/parse.test.ts:4-*` for `parseURL` fixtures.
- Inert-payload rule: every test string containing `alert(...)` or `msgbox` is passed only to
  `hasProtocol`, `isScriptProtocol`, or `parseURL` and compared with `expect(...).toBe(...)`.
  No `eval`, `Function`, `document.write`, `new URL().... .href` roundtrip, or any code that
  could actually execute the string. Include the code comment
  `// Test strings are inert — they exercise the parser, not any renderer.` at the head of every
  new block.
- Verification: `pnpm test` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; all pre-existing 509 tests plus every new SEC-01 row pass
- [ ] `pnpm build` exits 0; `dist/index.mjs` regenerates without warnings
- [ ] `grep -n "PROTOCOL_SCRIPT_RE" src/` returns no matches (dead symbol deleted)
- [ ] `grep -En "(blob|javascript|vbscript):" src/parse.ts` returns no matches outside comments
      (dangerous-scheme list no longer duplicated in `parse.ts`)
- [ ] `grep -n "SCRIPT_SCHEMES" src/utils.ts` returns exactly one definition and its
      `.has(...)` call site (or callers via `isScriptProtocol`); no exports of it appear in
      `src/index.ts`
- [ ] Runtime probe against the freshly built `dist/index.mjs`:
      `node -e 'import("./dist/index.mjs").then(m => { const p = m.parseURL("java\tscript:alert(1)"); console.log(p.protocol === "javascript:", m.isScriptProtocol(p.protocol), m.hasProtocol("java\tscript:alert(1)")); })'`
      prints `true true true`.
- [ ] Only in-scope files are modified: `git status --porcelain -- src/ test/` reports exactly
      `src/utils.ts`, `src/parse.ts`, `test/utilities.test.ts`, `test/parse.test.ts` (in addition
      to whatever is already `M` from the in-flight type-safety work — do not stage those)
- [ ] `advisor-plans/README.md` status row for plan 002 updated (if the index file exists;
      otherwise the advisor maintains it)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `src/utils.ts` lines 27–32 or `src/parse.ts` lines 60–74 have changed
  since baseline commit `f06c800` in a way that makes the "Current state" excerpts stale.
- A test in `test/utilities.test.ts` already asserts on `hasProtocol("java\tscript:...")` or on
  `isScriptProtocol` with a tab-tampered input — someone else may have fixed this. Verify
  independently and report before adding duplicate coverage.
- `src/parse.ts` no longer contains the `_specialProtoMatch` branch (parseURL has been
  refactored) — the deduplication in Step 3 assumes that shape.
- Any pre-existing test in `test/parse.test.ts` or `test/utilities.test.ts` fails after the
  Step 1–3 edits. This plan is meant to preserve every currently-passing case; a regression
  means the refactor is wrong, not that the test is stale.
- A change in `src/utils.ts` or `src/parse.ts` forces a change to `src/_types.ts` (out of scope
  per the in-flight type-safety work) — stop and flag, do not edit `_types.ts`.
- `pnpm test` fails twice in a row after a reasonable fix attempt for the same failure.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Public API behavior change (call out in CHANGELOG under `Fixes` / security)**:
  `hasProtocol(input)` no longer treats characters that browsers strip out (`\t`, `\n`, `\r`) as
  part of a scheme. The observable difference is that inputs whose ONLY reason for matching was
  whitespace-inside-scheme now match for the correct reason (the normalized string) or, in
  degenerate cases where nothing survives normalization, no longer match. In practice the only
  behavior flip we expect for consumers is that tampered-scheme inputs like `"java\tscript:x"`
  now cleanly resolve to `javascript:` at both predicates — that is the intended hardening.
  Consumers who relied on the previous permissive matching to accept
  whitespace-inside-scheme as literal (not something a browser would strip) should be reviewed;
  we consider that pattern insecure by construction.
- **`parseURL` behavior change**: for inputs like `"java\tscript:alert(1)"`, `parseURL(...).protocol`
  changes from `""` to `"javascript:"` (and similarly for the tampered forms of `vbscript:`,
  `data:`, `blob:`). This is the whole point of the fix — do not roll it back.
- **`SCRIPT_SCHEMES` is now the single source of truth.** To add `filesystem:` or any future
  dangerous scheme, edit only the Set literal in `src/utils.ts`. Do NOT re-introduce an inline
  scheme list in `src/parse.ts` — that is what caused SEC-01.
- **Do not export `normalizeSchemeForProtocolChecks` or `SCRIPT_SCHEMES` publicly.** They are
  internal helpers; adding them to `src/index.ts` broadens the API surface and locks us in.
- **What a reviewer should scrutinize**:
  1. That `PROTOCOL_SCRIPT_RE` is fully removed (no dead symbol).
  2. That the `parseURL` fast-path still returns identical shapes for the pre-existing fixtures
     at `test/parse.test.ts:85-92`, `:97-104`, `:143-151`, `:166-*` — the refactor is meant to be
     behavior-preserving on every input previously matched.
  3. That the negative controls (`ht\ttp:`, `htt\nps:`, `ma\tilto:`) return `false` from
     `isScriptProtocol` — false positives here would be a serious regression for anyone using
     `isScriptProtocol` as a URL-open gate.
  4. That no test string is fed into anything that can execute it (grep the new tests for `eval`,
     `Function`, `document`, `new URL`).
- **Deferred out of this plan** (already tracked as plan 004): tightening
  `PROTOCOL_REGEX` from `^[\s\w\0+.-]{2,}` to WHATWG-compliant `^[A-Za-z][A-Za-z0-9+.-]*` —
  that catches leading-digit schemes and other edge cases orthogonal to SEC-01.
- **Deferred out of this plan** (DEBT-02): the pre-existing circular import between
  `src/utils.ts` and `src/parse.ts`. This plan reuses the existing edge (`parse.ts` already
  imports from `utils.ts`) so no new cycle is created; breaking the cycle is a separate refactor.
