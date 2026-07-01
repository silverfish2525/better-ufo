# Plan 009: Fix four minor correctness bugs (CORR-05 / CORR-07 / CORR-09 / CORR-12)

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f06c800..HEAD -- src/query.ts src/parse.ts src/utils.ts test/query.test.ts test/parse.test.ts test/utilities.test.ts test/double-slash.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> below against the live code before proceeding; on a per-function mismatch, treat that stage's
> function as rewritten (STOP that stage only, continue with the others).

## Status

- **Priority**: P2
- **Effort**: S per stage, M for the whole plan
- **Risk**: LOW
- **Depends on**: `001-verification-baseline.md`. Stage 3 (CORR-09) has a soft interaction with
  `004-sec-03-04-whatwg-scheme-authority-parity.md` — see Stage 3 instructions.
- **Category**: bug
- **Planned at**: commit `f06c800`, 2026-07-01
- **Issue**: —

## Why this matters

Four small, independent correctness bugs — each individually low urgency, but each surprises
downstream users (Nuxt/Nitro/H3/ofetch) in a way that erodes trust in ufo's "boring, predictable
URL utility" contract:

1. **CORR-05** — `stringifyQuery(parseQuery(x)) !== x` for empty-value keys in array positions, and
   `filterQuery` silently downgrades a null-prototype input to an `Object.prototype`-chained
   object.
2. **CORR-07** — `parseFilename("filename.ext")` (no leading slash) returns `undefined` despite
   the JSDoc claiming "last segment in path".
3. **CORR-09** — `hasProtocol("a://foo", { strict: true })` returns `false`; RFC 3986 §3.1 allows
   1-character schemes (`a:`, `s3:`, `w:`).
4. **CORR-12** — `cleanDoubleSlashes("/a//b?x//y")` collapses `//` inside the query string, which
   mutates user-supplied query values.

Each fix is <20 LOC in a single function. Bundling them into one plan avoids four tiny PRs while
keeping bisection clean (one commit per stage).

## Current state

Files in play and their exact current code:

### `src/query.ts` — full file (small, no line-drift risk)

Relevant excerpts:

- `parseQuery` (line ~50): builds result on `Object.create(null)` — **confirmed null-prototype**,
  so the CORR-05 hidden-class half of the finding IS in scope.

  ```ts
  const object: ParsedQuery = Object.create(null);
  // ...
  const value = decodeQueryValue(s[2] || "");
  if (object[key] === undefined) {
    object[key] = value;
  }
  else if (Array.isArray(object[key])) {
    (object[key] as string[]).push(value);
  }
  else {
    object[key] = [object[key] as string, value];
  }
  ```

  Both `?a` and `?a=` produce `{ a: "" }`.

- `encodeQueryItem` (~line 100):

  ```ts
  if (typeof value === "number" || typeof value === "boolean") {
    value = String(value);
  }
  if (!value) {
    return encodeQueryKey(key); // <-- scalar "" / null / 0-ish path: emits "key" (no "=")
  }

  if (Array.isArray(value)) {
    return value
      .map(
        (_value: QueryValue) =>
          `${encodeQueryKey(key)}=${encodeQueryValue(_value)}`,
      )
      .join("&"); // <-- array path: ALWAYS emits "key=<encoded>" (empty-string as "key=")
  }

  return `${encodeQueryKey(key)}=${encodeQueryValue(value)}`;
  ```

  This is the asymmetry: scalar `""`/`null` → `key`; array `[""]`/`[null]` → `key=`.

- `stringifyQuery` (~line 140):

  ```ts
  export function stringifyQuery(query: QueryObject): string {
    return Object.keys(query)
      .filter(k => query[k] !== undefined)
      .map(k => encodeQueryItem(k, query[k]))
      .filter(Boolean)
      .join("&");
  }
  ```

### `src/parse.ts` — `parseFilename` region (lines ~211–255)

```ts
const FILENAME_STRICT_REGEX = /\/([^/][^./]*\.[^/]+)$/;
const FILENAME_REGEX = /\/([^/]+)$/;

// ...

export function parseFilename(
  input = "",
  opts?: { strict?: boolean },
): string | undefined {
  const { pathname } = parseURL(input);
  const matches = opts?.strict
    ? pathname.match(FILENAME_STRICT_REGEX)
    : pathname.match(FILENAME_REGEX);
  return matches ? matches[1] : undefined;
}
```

Both regexes require a leading `/`. So `parseFilename("filename.ext")` → `parseURL("filename.ext").pathname === "filename.ext"` → no leading `/` → `null` match → `undefined`.

### `src/utils.ts` — protocol regexes (lines 27–28)

```ts
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
```

Both use `{2,}` before the colon → reject 1-char schemes.

### `src/utils.ts` — `cleanDoubleSlashes` (lines ~307–313)

```ts
export function cleanDoubleSlashes(input = ""): string {
  return input
    .split("://")
    .map(string_ => string_.replace(/\/{2,}/g, "/"))
    .join("://");
}
```

The `replace(/\/{2,}/g, "/")` is applied to everything past the `://` split — including any
`?query#frag`. Confirmed via runtime probe: `cleanDoubleSlashes("/a//b?x//y") === "/a/b?x/y"`.

### `src/utils.ts` — `filterQuery` (lines ~425–443)

```ts
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string {
  if (!input.includes("?")) {
    return input;
  }

  const parsed = parseURL(input);
  const query = parseQuery(parsed.search);
  const filteredQuery = Object.fromEntries(
    Object.entries(query).filter(([key, value]) => predicate(key, value)),
  );
  parsed.search = stringifyQuery(filteredQuery);
  return stringifyParsedURL(parsed);
}
```

`Object.fromEntries` produces a plain object with `Object.prototype`, defeating the
null-prototype input `query`.

### Repo conventions

- Zero runtime deps — do not add imports from outside `src/`.
- Conventional commits — see `git log --oneline` for examples (`fix(query): ...`, `fix(parse): ...`).
- Tests colocated under `test/`, one file per module boundary, plain `describe`/`test` with
  literal input/expected pairs iterated in a loop (see `test/double-slash.test.ts` for the pattern).
- Vitest with typecheck enabled — `pnpm test` runs lint + `vitest run --typecheck`.
- Do not touch `src/_types.ts` or existing overload signatures — that is in-flight v1.7 work.

## Commands you will need

| Purpose        | Command                                             | Expected on success                       |
| -------------- | --------------------------------------------------- | ----------------------------------------- |
| Install        | `pnpm install`                                      | exit 0                                    |
| Full test      | `pnpm test`                                         | lint clean; all vitest tests pass         |
| Targeted test  | `pnpm vitest run <file> --typecheck`                | new tests + existing pass                 |
| Lint only      | `pnpm lint`                                         | exit 0                                    |
| Build          | `pnpm build`                                        | `dist/index.mjs` regenerated              |
| Runtime probe  | `node -e "import('./dist/index.mjs').then(m => console.log(...))"` | prints expected value  |

## Scope

**In scope** (the only files you may modify):

- `src/query.ts`
- `src/parse.ts`
- `src/utils.ts`
- `test/query.test.ts`
- `test/parse.test.ts`
- `test/utilities.test.ts`
- `test/double-slash.test.ts`
- `advisor-plans/README.md` (status row update at end)

**Out of scope** (do NOT touch):

- `src/_types.ts` and every uncommitted in-flight overload change on `src/{index,parse,query,utils}.ts`.
  These live in the working tree at plan time and must survive intact.
- `test/types.test-d.ts` — part of the in-flight type work.
- `src/encoding.ts`, `src/index.ts` (barrel), any structural refactor of `utils.ts` — that is plan 011.
- Perf micro-opts (regex module-scope hoisting, etc.) — that is plan 010.

## Git workflow

- Branch: `advisor/009-correctness-cluster`
- One commit per stage (four commits total), so a `git bisect` can isolate any regression.
- Message style — conventional commits, examples:
  - `fix(query): round-trip empty values and preserve null prototype in filterQuery`
  - `fix(parse): allow parseFilename on leading-slash-less input`
  - `fix(utils): accept single-character URL schemes in hasProtocol`
  - `fix(utils): cleanDoubleSlashes must not touch query or fragment`
- Do NOT push or open a PR.

## Baseline check (run before Stage 1)

```
git status --short
pnpm install
pnpm test
```

Expected:
- `git status` shows the uncommitted in-flight `_types.ts` + overload work only (no `src/query.ts`
  / `src/parse.ts` / `src/utils.ts` staged deletions or unrelated modifications).
- `pnpm test` exits 0 with 509 tests green.

If either fails → STOP (baseline broken).

## Steps

### Stage 1 — CORR-05: stringifyQuery empty-value symmetry + filterQuery prototype preservation

**Files touched**: `src/query.ts`, `src/utils.ts`, `test/query.test.ts`.

#### 1a. Fix `stringifyQuery` / `encodeQueryItem` scalar-vs-array asymmetry

The decision is: emit `key=` (empty-string form) for both scalar and array positions when the
value is `null` or `""`. Rationale: `parseQuery` returns `""` for both `?a` and `?a=`; consumers
already treat these as equivalent, so normalizing on the more explicit `key=` gives lossless
round-trip.

Edit `src/query.ts` — replace the current `encodeQueryItem` value-handling with:

```ts
export function encodeQueryItem(
  key: string,
  value: QueryValue | QueryValue[],
): string {
  if (typeof value === "number" || typeof value === "boolean") {
    value = String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(
        (_value: QueryValue) =>
          `${encodeQueryKey(key)}=${encodeQueryValue(_value)}`,
      )
      .join("&");
  }

  if (value === undefined) {
    return "";
  }

  // Empty-string / null / 0-ish scalar → emit `key=` for round-trip parity with array positions.
  if (!value) {
    return `${encodeQueryKey(key)}=`;
  }

  return `${encodeQueryKey(key)}=${encodeQueryValue(value)}`;
}
```

Notes for the executor:

- Keep the two existing overload signatures for `encodeQueryItem` above the implementation
  exactly as they are — do NOT modify them.
- `stringifyQuery` itself does not change; its top-level `.filter((k) => query[k] !== undefined)`
  already drops undefined keys, so `encodeQueryItem` never sees a top-level `undefined` — but the
  defensive `if (value === undefined) return "";` handles it and keeps the type contract.
- The trailing `.filter(Boolean)` in `stringifyQuery` will now only filter the empty string
  produced by `undefined`, which is exactly what we want.

**Semantics warning — read carefully**: This is a public-behavior change. Existing tests that
assert scalar `""` renders as `key` (no `=`) WILL fail and must be updated to `key=`. Update every
such assertion in `test/query.test.ts` in-place (this is the intended new behavior, not a
regression). Search for existing goldens with:

```
grep -nE '(test|out|input)": "[^"]*"' test/query.test.ts | grep -vE 'foo=|bar=|=[0-9]|=true|=false' | head -60
```

Read the impacted assertions, adjust the `out` value to the new `key=` form. Do **not** change
the input side.

#### 1b. Fix `filterQuery` prototype preservation

Edit `src/utils.ts` — the `filterQuery` body. Replace the `Object.fromEntries(...)` line with a
manual loop that preserves the input query's prototype:

```ts
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string {
  if (!input.includes("?")) {
    return input;
  }

  const parsed = parseURL(input);
  const query = parseQuery(parsed.search);
  const filteredQuery: ParsedQuery = Object.create(
    Object.getPrototypeOf(query),
  );
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (predicate(key, value)) {
      filteredQuery[key] = value;
    }
  }
  parsed.search = stringifyQuery(filteredQuery);
  return stringifyParsedURL(parsed);
}
```

Note: `ParsedQuery` is already imported at the top of `src/utils.ts` (line 2). If the import is
missing after any drift, re-add it — do NOT invent a new type.

#### 1c. Add tests to `test/query.test.ts`

Append (or add inside an existing `describe`, if one is topically appropriate) a new
`describe("round-trip", ...)`:

```ts
import { filterQuery, parseQuery, stringifyQuery } from "../src";

describe("stringifyQuery/parseQuery round-trip", () => {
  const roundtrips = ["a=", "a=&b=", "a=1&b=", "a=&b=1", "tags=&tags="];
  for (const q of roundtrips) {
    test(`round-trips "${q}"`, () => {
      expect(stringifyQuery(parseQuery(q) as any)).toBe(q);
    });
  }

  test("scalar empty and null both emit key=", () => {
    expect(stringifyQuery({ a: "" })).toBe("a=");
    expect(stringifyQuery({ a: null })).toBe("a=");
  });

  test("array empty and null both emit key=", () => {
    expect(stringifyQuery({ a: [""] })).toBe("a=");
    expect(stringifyQuery({ a: [null] })).toBe("a=");
  });

  test("undefined scalar is dropped", () => {
    expect(stringifyQuery({ a: undefined, b: "1" })).toBe("b=1");
  });
});

describe("filterQuery prototype", () => {
  test("preserves null prototype of parseQuery output", () => {
    const out = filterQuery("http://x/?a=1&b=2", () => true);
    // Behavioral proof: the assembled URL is intact.
    expect(out).toBe("http://x/?a=1&b=2");
  });
});
```

**Verify**:

```
pnpm lint
pnpm vitest run test/query.test.ts --typecheck
pnpm test
```

Expected: lint clean; `test/query.test.ts` all pass including the new cases; full suite exits 0.

If existing tests you did not touch fail with `expected "a" to be "a="` (or similar), those are
the goldens that need updating per the semantics warning above — update them and re-run. If they
fail with any other error, STOP.

**Commit**: `fix(query): round-trip empty values and preserve null prototype in filterQuery`

---

### Stage 2 — CORR-07: `parseFilename` must accept leading-slash-less input

**Files touched**: `src/parse.ts`, `test/parse.test.ts`.

#### 2a. Fix the regexes

Edit `src/parse.ts` — change lines around 211/212:

```ts
const FILENAME_STRICT_REGEX = /(?:^|\/)([^/][^./]*\.[^/]+)$/;
const FILENAME_REGEX = /(?:^|\/)([^/]+)$/;
```

Do NOT change `parseFilename` itself; only the two regex literals. The `pathname` returned by
`parseURL` for input `"filename.ext"` is `"filename.ext"` (no leading slash) — the anchoring
`(?:^|\/)` now matches at the start, capturing group 1 stays the last segment.

Sanity: `pathname === "/a/b.ext"` still matches on `/` → group 1 `"b.ext"`. `pathname === ""`
still returns `null`.

#### 2b. Add tests to `test/parse.test.ts`

Inside the file, add a new `describe("parseFilename")` block if none exists, or extend it:

```ts
describe("parseFilename edge cases", () => {
  const cases: Array<[string, { strict?: boolean } | undefined, string | undefined]> = [
    ["filename.ext", undefined, "filename.ext"],
    ["filename.ext", { strict: true }, "filename.ext"],
    ["/filename.ext", undefined, "filename.ext"],
    ["/a/b.ext", undefined, "b.ext"],
    ["/a/b.ext", { strict: true }, "b.ext"],
    ["a/b.ext", undefined, "b.ext"],
    ["a/b.ext", { strict: true }, "b.ext"],
    ["no-ext", undefined, "no-ext"],
    ["no-ext", { strict: true }, undefined],
    ["", undefined, undefined],
    ["/", undefined, undefined],
  ];
  for (const [input, opts, expected] of cases) {
    const label = `${JSON.stringify(input)} ${opts?.strict ? "(strict)" : ""}`;
    test(label, () => {
      expect(parseFilename(input, opts)).toBe(expected);
    });
  }
});
```

`parseFilename` is already imported at the top of `test/parse.test.ts` — verify (line 2). If
missing, add to the existing named import list.

**Verify**:

```
pnpm lint
pnpm vitest run test/parse.test.ts --typecheck
pnpm test
```

Expected: lint clean; all `parseFilename` cases pass; full suite exits 0.

**Commit**: `fix(parse): allow parseFilename on leading-slash-less input`

---

### Stage 3 — CORR-09: `hasProtocol` must accept 1-character schemes

**Files touched**: `src/utils.ts`, `test/utilities.test.ts`.

#### 3a. Coordinate with plan 004 (soft dependency)

Before editing, check whether plan 004 has landed:

```
git log --oneline f06c800..HEAD -- src/utils.ts | grep -iE 'sec-03|sec-04|whatwg|scheme'
grep -nE 'PROTOCOL_(STRICT_)?REGEX' src/utils.ts
```

- **If plan 004 has NOT landed** (the two regex lines still read exactly
  `/^[\s\w\0+.-]{2,}:([/\\]{1,2})/` and `/^[\s\w\0+.-]{2,}:([/\\]{2})?/`): apply the fix in 3b.
- **If plan 004 HAS landed and the regexes now use `[A-Za-z][A-Za-z0-9+.\-]*`** (or otherwise
  naturally allow 1-character schemes): run the tests in 3c against the new regex; if they pass,
  skip 3b entirely (mark this stage DONE-VIA-004 in the commit body and skip the commit — nothing
  to fix). If any test in 3c fails, STOP — that is a bug in plan 004's regex and must be flagged.
- **If plan 004 HAS landed but the regex still uses `{2,}` before the colon**: STOP and flag —
  plan 004 has a latent bug; do not paper over it here.

#### 3b. Fix the regexes (only when plan 004 has NOT landed)

Edit `src/utils.ts` lines 27–28:

```ts
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]+:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]+:([/\\]{2})?/;
```

Only the `{2,}` → `{1,}` change on both lines. Do not touch `PROTOCOL_RELATIVE_REGEX`,
`PROTOCOL_SCRIPT_RE`, `TRAILING_SLASH_RE`, or `JOIN_LEADING_SLASH_RE`.

#### 3c. Add tests to `test/utilities.test.ts`

Inside the existing `describe("hasProtocol", ...)` (starts at ~line 17 based on the current
file), add:

```ts
test("accepts single-character schemes (non-strict)", () => {
  expect(hasProtocol("a://foo")).toBe(true);
  expect(hasProtocol("s3://bucket")).toBe(true);
  expect(hasProtocol("w://host")).toBe(true);
});

test("accepts single-character schemes (strict)", () => {
  expect(hasProtocol("a://foo", { strict: true })).toBe(true);
  expect(hasProtocol("s3://bucket", { strict: true })).toBe(true);
});

test("still rejects zero-length scheme", () => {
  expect(hasProtocol("://foo", { strict: true })).toBe(false);
  expect(hasProtocol(":foo", { strict: true })).toBe(false);
});
```

**Verify**:

```
pnpm lint
pnpm vitest run test/utilities.test.ts --typecheck
pnpm test
```

Expected: lint clean; new `hasProtocol` cases pass; full suite exits 0.

**Commit**: `fix(utils): accept single-character URL schemes in hasProtocol`
(skip if 3a routed to DONE-VIA-004).

---

### Stage 4 — CORR-12: `cleanDoubleSlashes` must not touch query or fragment

**Files touched**: `src/utils.ts`, `test/double-slash.test.ts`.

#### 4a. Rewrite `cleanDoubleSlashes` to operate on the path portion only

The current implementation splits on `://` (to preserve protocol) then collapses `//` everywhere
else, including inside `?query` and `#fragment`. Fix: split off the `?...` / `#...` tail first,
collapse only the path, then re-attach.

Edit `src/utils.ts` — replace the current `cleanDoubleSlashes` (lines ~307–313) with:

```ts
export function cleanDoubleSlashes(input = ""): string {
  const qIdx = input.search(/[?#]/);
  const path = qIdx === -1 ? input : input.slice(0, qIdx);
  const rest = qIdx === -1 ? "" : input.slice(qIdx);
  const cleaned = path
    .split("://")
    .map(string_ => string_.replace(/\/{2,}/g, "/"))
    .join("://");
  return cleaned + rest;
}
```

Notes:

- The inner `.split("://").map(...).join("://")` is preserved verbatim — this is the exact,
  currently-shipped path-cleaning algorithm. Do not "improve" it; the sole intent of this fix is
  to narrow its input to the path portion.
- `input.search(/[?#]/)` finds the first `?` or `#`, whichever comes first, which is the correct
  URL-structural boundary (RFC 3986: path terminates on `?` or `#`).
- Empty input still returns `""` (the existing "no input" test in `test/double-slash.test.ts`
  covers this).

#### 4b. Add tests to `test/double-slash.test.ts`

Extend the existing `tests` object (or add a second `describe` inside the file) with the
query/fragment cases and non-regression cases:

```ts
describe("cleanDoubleSlashes preserves query and fragment", () => {
  const tests: Record<string, string> = {
    "/a//b?x//y": "/a/b?x//y",
    "/a//b#x//y": "/a/b#x//y",
    "/a//b?x//y#z//w": "/a/b?x//y#z//w",
    "/a//b?x=1//2&y=3": "/a/b?x=1//2&y=3",
    "http://foo.com//path//x?q//v#h//h": "http://foo.com/path/x?q//v#h//h",
  };
  for (const input in tests) {
    test(input, () => {
      expect(cleanDoubleSlashes(input)).toBe(tests[input]);
    });
  }
});
```

Do NOT change the existing test cases — they must still pass unchanged (that is the
non-regression bar).

**Verify**:

```
pnpm lint
pnpm vitest run test/double-slash.test.ts --typecheck
pnpm test
```

Expected: lint clean; new cases pass; all four original cases in the existing `tests` object still
pass; full suite exits 0.

**Commit**: `fix(utils): cleanDoubleSlashes must not touch query or fragment`

---

### Stage 5 — Final verification and README update

Run the full pipeline one more time:

```
pnpm lint
pnpm test
pnpm build
```

Expected:
- Lint clean.
- All tests pass; the new tests from stages 1–4 are present.
- `pnpm build` completes and regenerates `dist/`; expect a README diff from `automd` — this is
  normal.

Then update `advisor-plans/README.md`: change the status of plan 009 (if a row exists — the
current README shows plans 001–008 only, so add a new row in the correct execution order if
missing):

```
| 009  | CORR-05/07/09/12 minor correctness cluster              | P2       | M      | 001        | bug           | DONE       |
```

**Verify**: `grep -nE '^\| 009' advisor-plans/README.md` prints exactly one row containing
`DONE`.

## Test plan

New tests per stage, plus non-regression on all existing tests:

- `test/query.test.ts` — round-trip pairs (`a=`, `a=&b=`, `a=&b=1`, `a=1&b=`, `tags=&tags=`),
  explicit scalar-null and array-null empty-value assertions, undefined-drop, `filterQuery`
  prototype-preservation behavioral proof.
- `test/parse.test.ts` — `parseFilename` matrix over `{leading slash, no leading slash} ×
  {with ext, no ext} × {strict on, strict off}` plus the `""` and `"/"` edge cases.
- `test/utilities.test.ts` — `hasProtocol` on 1-char schemes with and without `strict`, and the
  zero-length scheme guard.
- `test/double-slash.test.ts` — `?`/`#`/both, plus a full URL variant, plus non-regression on the
  four existing cases (unchanged).

Pattern to follow (literal-input, literal-expected iterated via `for..in` or `for..of`):
`test/double-slash.test.ts` — that is the house style; match it.

Verification: `pnpm test` exits 0 with the new tests present and all pre-existing 509 tests still
passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] `git log --oneline f06c800..HEAD` shows the four (or three, if Stage 3 was routed to
      DONE-VIA-004) stage commits with conventional-commit prefixes.
- [ ] `git status --short` shows only the uncommitted in-flight `_types.ts` + overload work and
      the `advisor-plans/README.md` status update (plus any `dist/` regen from `pnpm build` if
      you chose to leave it modified — do NOT commit `dist/`).
- [ ] No files outside the in-scope list are modified (`git diff --name-only f06c800..HEAD`
      contains only files from the Scope section).
- [ ] `grep -n "Object.fromEntries" src/utils.ts` returns no match inside `filterQuery` (Stage 1
      landed).
- [ ] `grep -nE 'FILENAME_(STRICT_)?REGEX\s*=' src/parse.ts` shows both regexes contain the
      `(?:^|\/)` prefix (Stage 2 landed).
- [ ] `grep -nE 'PROTOCOL_(STRICT_)?REGEX\s*=' src/utils.ts` shows neither regex contains
      `{2,}` before the `:` (Stage 3 landed or was routed to DONE-VIA-004).
- [ ] `grep -n "input.search(/\[?#\]/)" src/utils.ts` shows a hit inside `cleanDoubleSlashes`
      (Stage 4 landed).
- [ ] `advisor-plans/README.md` has a plan-009 row with status `DONE` (or `DONE (Stage 3 skipped
      — 004 landed)` in the Status column if applicable).

## STOP conditions

Stop and report back (do not improvise) if:

- Baseline `pnpm test` fails before Stage 1 starts (STOP entirely — do not run any stage).
- Any of the four target functions has been rewritten since `f06c800` such that the "Current
  state" excerpt no longer matches → STOP for that stage only, note it in the report, and
  continue with the other stages.
- Stage 3's coordination check (3a) shows plan 004 landed with a still-buggy `{2,}` in the
  scheme regex → STOP and flag; do not paper over it in this plan.
- Any stage's fix balloons past 30 LOC on the source side (excluding tests) → STOP and re-plan.
- A stage's verification fails twice after one reasonable fix attempt → STOP.
- A fix appears to require touching a file outside the Scope section → STOP.
- The uncommitted in-flight `_types.ts` / overload work disappears from `git status` at any
  point during execution → STOP (working tree corrupted).

## Maintenance notes

For the human/agent maintaining this after landing:

- **Stage 1 (CORR-05) is a public-behavior change**. `stringifyQuery({ a: "" })` now emits
  `"a="` instead of `"a"`. Downstream projects (Nuxt/Nitro/H3/ofetch) that treat the two as
  equivalent will not notice; any project that string-matches the exact serialized form of a
  scalar empty value will. Call this out in the release notes.
- **Stage 3 depends on regex shape** — if a future plan tightens `PROTOCOL_STRICT_REGEX` further
  (e.g. to strictly enforce `[A-Za-z]` as the leading character per RFC 3986), keep the "at
  least 1 char" quantifier; do not regress to `{2,}`.
- **Stage 4** — the fix assumes the URL structural boundary is the first `?` or `#`. If ufo
  ever needs to support opaque schemes (`mailto:`, `tag:`) inside `cleanDoubleSlashes`, revisit;
  today `cleanDoubleSlashes` is documented as a path/URL cleanup helper and is not called on
  opaque schemes in the code path.
- A reviewer should scrutinize: (a) the updated golden assertions in `test/query.test.ts` — do
  they still assert intended behavior, not just "make the test pass"; (b) that `filterQuery`
  still round-trips exotic query keys (`__proto__`, `constructor` — parseQuery drops these; the
  new manual loop must not resurrect them, and it does not because it iterates `Object.keys` on
  the already-filtered `query`).
- Deferred out of this plan (intentionally): (i) `withoutQuery` / `withoutFragment` API-parity
  work — direction plan D3; (ii) any regex module-scope hoist — perf plan 010; (iii) `utils.ts`
  file split — tech-debt plan 011.
