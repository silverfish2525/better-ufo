# Plan 003: Close the `joinURL` / `withBase` open-redirect via leading `//` normalization

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat f06c800..HEAD -- src/utils.ts test/join.test.ts test/base.test.ts README.md
> ```
>
> If any in-scope file changed since `f06c800`, compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition (see STOP #1).

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED — behavior change on a very hot public function used by Nuxt/Nitro/H3/ofetch.
- **Depends on**: `advisor-plans/001-*.md` (verification baseline)
- **Category**: security
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`joinURL` and `withBase` will happily hand back a protocol-relative URL (`//attacker.com/…`) when
the base is empty or `/` and a joined segment begins with `//`. In a browser, a redirect to a
protocol-relative URL resolves to the attacker's origin. Any downstream consumer doing
`redirect(joinURL(baseURL, req.query.next))` — a shape that appears in ofetch, Nitro middleware
patterns, and Nuxt route redirects — inherits a textbook open-redirect
(OWASP A01/A08, CWE-601). Verified at commit `f06c800` against `dist/index.mjs`:

- `joinURL("", "//attacker.com/x")` → `"//attacker.com/x"`
- `joinURL("/", "//attacker.com/x")` → `"//attacker.com/x"`
- `withBase("//attacker.com/x", "/")` → `"//attacker.com/x"`

After this plan lands, all three return a path-anchored `"/attacker.com/x"` unless the caller
explicitly opts in with `{ allowProtocolRelative: true }`.

## Design decision (baked into this plan — do not deviate)

Three options were considered:

1. **Silent normalization** — collapse leading `//` in the result to `/` when the base did not
   supply a scheme/authority. Preserves function shape; no thrown exceptions.
2. **Throw** on the ambiguous shape. Loud, but breaks any consumer currently relying on the buggy
   behavior with no escape hatch short of a `try/catch` shim.
3. **Opt-in strict flag** — new option `{ strict: true }`, default remains buggy. Zero migration
   cost, but leaves 99% of consumers exposed by default.

**Chosen: Option 1 + escape hatch.** Rationale:

- `ufo` is a URL-plumbing utility; throwing from `joinURL` would ripple through every downstream
  framework in unpredictable places (ofetch retry loops, Nitro middleware, SSR render paths).
- Silent normalization keeps the type signature stable and the failure mode benign — a stripped
  slash instead of a hijacked origin.
- The escape hatch — a new options object `{ allowProtocolRelative: true }` — lets the tiny
  minority who *do* want protocol-relative construction (e.g. HTML link generators) opt back in
  explicitly. Default is `false` = normalize.
- The behavior change is public and MUST be called out in CHANGELOG with a migration example.

## Current state

Files in play:

- `src/utils.ts` — `joinURL`, `withBase`, `hasProtocol`, `PROTOCOL_RELATIVE_REGEX`,
  `isEmptyURL`, `isNonEmptyURL`.
- `test/join.test.ts` — data-driven `joinURL` / `joinRelativeURL` tests. Existing intentional
  protocol-relative case at line 24 (`["//google.com/", "./foo", "/bar"] → "//google.com/foo/bar"`)
  MUST continue to pass — the base itself carries the `//`, so the caller's intent is unambiguous.
- `test/base.test.ts` — data-driven `withBase` / `withoutBase` tests. Note lines 65–69 already
  encode "collapse leading `//`" behavior for `withoutBase` (a prior related fix, `5cd9e67 fix(withoutBase): collapse leading slashes`) — this plan extends the same posture to `joinURL` and `withBase`.
- `README.md` — the `joinURL` and `withBase` docs at lines 370–377 and 407–418 are automd-generated
  from JSDoc in `src/utils.ts`. `pnpm build` regenerates the README section.

### Excerpt: `PROTOCOL_RELATIVE_REGEX` and neighbors — `src/utils.ts:27–31`

```ts
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
const PROTOCOL_RELATIVE_REGEX = /^([/\\]\s*){2,}[^/\\]/;
const PROTOCOL_SCRIPT_RE = /^[\s\0]*(blob|data|javascript|vbscript):$/i;
const TRAILING_SLASH_RE = /\/$|\/\?|\/#/;
```

### Excerpt: `hasProtocol` — `src/utils.ts:53–105` (relevant slice)

```ts
export interface HasProtocolOptions {
  acceptRelative?: boolean;
  strict?: boolean;
}

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
```

`hasProtocol(x, { acceptRelative: true })` returns `true` for both `"https://…"` and `"//…"`. This
is the exact predicate we use to decide whether the caller already intended a protocol-relative
result.

### Excerpt: `withBase` — `src/utils.ts:343–355`

```ts
export function withBase(input: string, base: string) {
  if (isEmptyURL(base) || hasProtocol(input)) {
    return input;
  }
  const _base = withoutTrailingSlash(base);
  if (input.startsWith(_base)) {
    const nextChar = input[_base.length];
    // Ensure '/admin-dashboard' is not considered as having base '/admin/'
    if (!nextChar || nextChar === "/" || nextChar === "?") {
      return input;
    }
  }
  return joinURL(_base, input);
}
```

The bug lives in the very first branch: when `base` is empty/`/`, `withBase` returns `input` verbatim.
`hasProtocol(input)` (without `acceptRelative`) returns `false` for `"//attacker.com"`, so no early
protocol short-circuit catches it. Result: the protocol-relative payload is passed through.

### Excerpt: `joinURL` — `src/utils.ts:487–506`

```ts
export function joinURL<
  const Base extends string,
  const Rest extends readonly string[],
>(base: Base, ...input: Rest): JoinURLResult<Base, Rest>;
export function joinURL(base: string, ...input: string[]): string;
export function joinURL(base: string, ...input: string[]): string {
  let url = base || "";

  for (const segment of input.filter(url => isNonEmptyURL(url))) {
    if (url) {
      // TODO: Handle .. when joining
      const _segment = segment.replace(JOIN_LEADING_SLASH_RE, "");
      url = withTrailingSlash(url) + _segment;
    }
    else {
      url = segment;
    }
  }

  return url;
}
```

Note: the runtime signature is `(base: string, ...input: string[])` — **no options object today**.
The typed overload uses a `const` generic `Rest extends readonly string[]`. `JoinURLResult` lives in
`src/_types.ts`, which has in-flight uncommitted work and is **out of scope** for this plan (see
Scope § below).

`JOIN_LEADING_SLASH_RE = /^\.?\//` — strips a single leading `/` OR `./` from the segment before
concatenation. So `"//attacker.com".replace(/^\.?\//, "")` yields `"/attacker.com"`, and joining
against `url = "/"` produces `"/" + "/attacker.com" = "//attacker.com"` — the vulnerable shape.

### Excerpt: `isEmptyURL` / `isNonEmptyURL` — `src/utils.ts:463–474`

```ts
export function isEmptyURL(url: string) {
  return !url || url === "/";
}

export function isNonEmptyURL(url: string) {
  return url && url !== "/";
}
```

### Prior art in this repo

- `5cd9e67 fix(withoutBase): collapse leading slashes (#335)` — same class of hardening on
  `withoutBase`. See `test/base.test.ts:65–69` for the existing "Collapse leading `//` to prevent
  protocol-relative URL injection" cases. This plan is the natural extension to `joinURL` and
  `withBase`.
- `3cd8c3f fix: stringify protocol-relative URLs (#207)` — earlier serialization-side fix; does not
  overlap with join/base logic.

Cite `#335` in the commit message body and the CHANGELOG entry.

## Commands you will need

| Purpose        | Command                              | Expected on success              |
| -------------- | ------------------------------------ | -------------------------------- |
| Install        | `pnpm install`                       | exit 0                           |
| Full test      | `pnpm test`                          | exit 0, all tests pass (509+6)   |
| Focused test   | `pnpm vitest run test/join.test.ts`  | all pass                         |
| Focused test   | `pnpm vitest run test/base.test.ts`  | all pass                         |
| Typecheck      | `pnpm test:types` (via `pnpm test`)  | exit 0                           |
| Lint           | `pnpm lint`                          | exit 0                           |
| Build          | `pnpm build`                         | exit 0, `dist/` + README refresh |
| Prior-art peek | `git log --grep "protocol-relative"` | shows `#207`; ignore `#335` grep |

## Suggested executor toolkit

- Skill `vitest` for test authoring patterns and `describe`/`test` idioms.
- If you touch types beyond adding `JoinURLOptions` locally, invoke `typescript-strict-migrator`
  reasoning — but per Scope § below, deep type surgery is a STOP condition.
- Reference doc: `/Users/i584843/SAPDevelop/dev/ufo/.agents/skills/improve/references/plan-template.md`
  (this template).

## Scope

**In scope** (the only files you should modify):

- `src/utils.ts` — the `joinURL` and `withBase` fix, plus a shared internal helper.
- `test/join.test.ts` — new SEC-02 tests for `joinURL`.
- `test/base.test.ts` — new SEC-02 tests for `withBase`.
- `README.md` — will be regenerated by `pnpm build` (automd). Do **not** hand-edit; edit the JSDoc
  on `joinURL` / `withBase` in `src/utils.ts` and let the build refresh README.

**Out of scope** (do NOT touch, even though they look related):

- `src/_types.ts` — carries in-flight uncommitted overload work. If any signature change you make
  forces a change here, STOP (see STOP #4). You may `export interface JoinURLOptions { … }` from
  `src/utils.ts` itself.
- `src/parse.ts` — orthogonal.
- The `withBase` **fragment** handling (CORR-02/04) — owned by `advisor-plans/006-*`. Do not fold
  a fragment fix into this SEC-02 change; keep the diff surgical.
- `withoutBase` — the collapsing behavior is already in place (see prior-art `#335`).
- `resolveURL`, `joinRelativeURL`, `withProtocol`, `withoutProtocol` — leave alone. `joinRelativeURL`
  produces `.` / `..` segments and its own fixture (`test/join.test.ts` `relativeTests`); it is not
  in the redirect-hazard path this plan closes.
- Any change to public error-throwing behavior — the chosen design is silent normalization.

## Git workflow

- Branch: `advisor/003-sec-02-open-redirect-joinurl` (create with `git checkout -b`).
- One commit is fine, or split into (a) failing pin test, (b) fix + flip test, (c) README rebuild
  — whichever gives the cleaner review.
- Message style: conventional commits (see `git log --oneline -20`). Suggested subjects:
  - `fix(joinURL,withBase): normalize leading '//' to prevent open-redirect (SEC-02)`
  - Body should reference `#335` as prior art and mention the `allowProtocolRelative` opt-in.
- Do NOT push, tag, or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the branch and verify the drift check

```
git checkout -b advisor/003-sec-02-open-redirect-joinurl
git diff --stat f06c800..HEAD -- src/utils.ts test/join.test.ts test/base.test.ts
```

**Verify**: The diff-stat is empty OR only shows unrelated in-flight work in `src/_types.ts` /
`src/index.ts` / `src/parse.ts` / `src/query.ts` / `tsconfig.json` / `test/types.test-d.ts`. If any
of `src/utils.ts`, `test/join.test.ts`, `test/base.test.ts` has changed since `f06c800`, invoke
STOP #1.

### Step 2: Pin the current (buggy) behavior in a failing-then-flipped test

Before touching `src/utils.ts`, add **pin tests** that assert the current buggy output. Do this
first so, when you flip them, the diff is unambiguous evidence of the behavior change.

In `test/join.test.ts`, append a new `describe` block at the bottom:

```ts
// SEC-02 — leading '//' after join must not become a protocol-relative URL.
// Test strings model the attack pattern; no rendering side-effect is invoked.
describe("joinURL — SEC-02 leading '//' normalization", () => {
  test("empty base + '//' segment: collapses leading '//' to '/'", () => {
    expect(joinURL("", "//attacker.com/x")).toBe("/attacker.com/x");
  });
  test("'/' base + '//' segment: collapses leading '//' to '/'", () => {
    expect(joinURL("/", "//attacker.com/x")).toBe("/attacker.com/x");
  });
  test("protocol-carrying base is unaffected (no regression)", () => {
    expect(joinURL("https://a.com", "b")).toBe("https://a.com/b");
  });
  test("protocol-relative base is preserved (caller's explicit intent)", () => {
    // Already asserted above in the data-driven suite; re-pinned here for SEC-02 clarity.
    expect(joinURL("//google.com/", "./foo", "/bar")).toBe(
      "//google.com/foo/bar",
    );
  });
  test("escape hatch: { allowProtocolRelative: true } preserves '//'", () => {
    expect(
      joinURL("", "//attacker.com/x", { allowProtocolRelative: true }),
    ).toBe("//attacker.com/x");
  });
});
```

In `test/base.test.ts`, append a new `describe` block below the existing `withoutBase` tests:

```ts
// SEC-02 — withBase must not passthrough a protocol-relative input when base is empty/'/'.
// Test strings model the attack pattern; no rendering side-effect is invoked.
describe("withBase — SEC-02 leading '//' normalization", () => {
  test("empty base + '//' input: collapses leading '//' to '/'", () => {
    expect(withBase("//attacker.com/x", "")).toBe("/attacker.com/x");
  });
  test("'/' base + '//' input: collapses leading '//' to '/'", () => {
    expect(withBase("//attacker.com/x", "/")).toBe("/attacker.com/x");
  });
  test("proper base + '//' input still joins safely", () => {
    expect(withBase("//attacker.com/x", "/app")).toBe("/app/attacker.com/x");
  });
  test("protocol-carrying input is unaffected (no regression)", () => {
    expect(withBase("https://a.com", "/foo")).toBe("https://a.com");
  });
  test("escape hatch: { allowProtocolRelative: true } preserves '//'", () => {
    expect(
      withBase("//attacker.com/x", "/", { allowProtocolRelative: true }),
    ).toBe("//attacker.com/x");
  });
});
```

**Verify (fail expected)**:

```
pnpm vitest run test/join.test.ts test/base.test.ts
```

Expected: **the new tests fail** except the two "no regression" cases and the "protocol-relative
base is preserved" case. The failing outputs will show `"//attacker.com/x"` where `"/attacker.com/x"`
was expected. This proves the tests actually exercise the bug and are not accidentally passing.

If any new SEC-02 test *passes* on unpatched code, invoke STOP #2 (someone already fixed this).

### Step 3: Add the `JoinURLOptions` interface + shared normalization helper

Edit `src/utils.ts`. Immediately below the `HasProtocolOptions` interface (around line 53), add:

```ts
/**
 * Options accepted by {@link joinURL} and {@link withBase} to control leading
 * `//` handling on the concatenated result.
 *
 * @group utils
 */
export interface JoinURLOptions {
  /**
   * If `true`, a leading `//` in the concatenated result is preserved (produces
   * a protocol-relative URL). Default is `false` — the leading `//` is
   * collapsed to a single `/` to prevent accidental open-redirect payloads
   * when the base is empty or `"/"`.
   *
   * @default false
   */
  allowProtocolRelative?: boolean;
}
```

Then, near `PROTOCOL_RELATIVE_REGEX` (line 29) — a module-scope regex is fine but a small helper
is clearer — add an internal (non-exported) helper somewhere above `withBase`:

```ts
/**
 * Internal: collapse a leading run of 2+ slashes on `result` to a single `/`
 * when the effective `base` did not itself supply a scheme or protocol-relative
 * prefix. Used to prevent open-redirect via `joinURL("", "//attacker.com")`
 * and `withBase("//attacker.com", "/")`. See SEC-02.
 */
function _normalizeProtocolRelative(
  result: string,
  base: string,
  opts?: JoinURLOptions,
): string {
  if (opts?.allowProtocolRelative) {
    return result;
  }
  if (!result.startsWith("//")) {
    return result;
  }
  // If the base itself intentionally carried a scheme or a '//' prefix, the
  // caller is constructing a scheme-anchored or protocol-relative URL on
  // purpose — preserve it.
  if (hasProtocol(base, { acceptRelative: true })) {
    return result;
  }
  return `/${result.replace(/^\/+/, "")}`;
}
```

**Verify**: `pnpm lint` exits 0. `pnpm test:types` (folded into `pnpm test`) still compiles.

### Step 4: Wire the helper into `joinURL`

Rewrite the `joinURL` implementation body only (**do not touch** the two overload declarations
whose types come from `_types.ts`; add one additional overload for the options-carrying shape).

Above the existing overloads at `src/utils.ts:487–491`, keep the typed generic and the plain
`(base, ...input: string[])` overload untouched. Add one **new** overload immediately after them:

```ts
export function joinURL(
  base: string,
  ...input: [...string[], JoinURLOptions]
): string;
```

Then replace the implementation body:

```ts
export function joinURL(
  base: string,
  ...input: Array<string | JoinURLOptions>
): string {
  // Runtime detection: if the last argument is a plain object (not a string,
  // not an array, not null), treat it as options and pop it from `input`.
  let opts: JoinURLOptions | undefined;
  const last = input[input.length - 1];
  if (
    last !== null
    && typeof last === "object"
    && !Array.isArray(last)
  ) {
    opts = last as JoinURLOptions;
    input = input.slice(0, -1);
  }

  const segments = (input as string[]).filter(url => isNonEmptyURL(url));
  let url = base || "";

  for (const segment of segments) {
    if (url) {
      // TODO: Handle .. when joining
      const _segment = segment.replace(JOIN_LEADING_SLASH_RE, "");
      url = withTrailingSlash(url) + _segment;
    }
    else {
      url = segment;
    }
  }

  return _normalizeProtocolRelative(url, base, opts);
}
```

Important shape notes for the executor:

- The runtime detection accepts arrays being *filtered out* by treating them as unknown-object;
  arrays are not valid options and `!Array.isArray(last)` gates that. If a caller passes an array
  as the last positional (they shouldn't — the overload doesn't allow it), it will be filtered by
  `isNonEmptyURL` above and no harm is done.
- Do NOT change or remove the two pre-existing overload declarations (the `const Base extends string`
  generic and the `(base: string, ...input: string[]): string` overload). Those are consumed by
  `_types.ts` / `JoinURLResult`. Adding a third overload is additive and safe.
- The escape hatch is `{ allowProtocolRelative: true }`; the option is opt-in.

**Verify**:

```
pnpm vitest run test/join.test.ts
```

Expected: all `joinURL` tests pass, including the five new SEC-02 tests and the pre-existing
`["//google.com/", "./foo", "/bar"] → "//google.com/foo/bar"` case.

### Step 5: Wire the helper into `withBase`

Change the signature and body at `src/utils.ts:343–355`:

```ts
export function withBase(input: string, base: string, opts?: JoinURLOptions) {
  if (isEmptyURL(base) || hasProtocol(input)) {
    return _normalizeProtocolRelative(input, base, opts);
  }
  const _base = withoutTrailingSlash(base);
  if (input.startsWith(_base)) {
    const nextChar = input[_base.length];
    // Ensure '/admin-dashboard' is not considered as having base '/admin/'
    if (!nextChar || nextChar === "/" || nextChar === "?") {
      return _normalizeProtocolRelative(input, base, opts);
    }
  }
  return _normalizeProtocolRelative(joinURL(_base, input), base, opts);
}
```

Rationale for calling the helper on every return path: the passthrough branches (empty base,
already-starts-with-base) are exactly the ones that leak `"//attacker.com"` today. The final
`joinURL(_base, input)` path is already covered by `joinURL`'s own normalization, but calling the
helper again is idempotent and cheap — leave it for defense-in-depth and to keep every return path
audit-uniform.

Update the JSDoc block for `withBase` (immediately above its signature, roughly lines 320–342) to
include one extra example that documents the SEC-02 behavior:

```js
// Leading "//" is normalized (SEC-02 open-redirect hardening):
withBase("//attacker.com/x", "/"); // "/attacker.com/x"
// Opt-out is available for callers who genuinely want a protocol-relative URL:
withBase("//host/x", "/", { allowProtocolRelative: true }); // "//host/x"
```

Do the same for `joinURL`'s JSDoc (roughly lines 476–487):

```js
// Leading "//" in the result is normalized (SEC-02 open-redirect hardening):
joinURL("", "//attacker.com"); // "/attacker.com"
// Opt-out is available for callers who genuinely want a protocol-relative URL:
joinURL("", "//host", { allowProtocolRelative: true }); // "//host"
```

**Verify**:

```
pnpm vitest run test/base.test.ts
```

Expected: all `withBase` and `withoutBase` tests pass, including the five new SEC-02 tests.

### Step 6: Full test + lint + typecheck + build

```
pnpm lint
pnpm test
pnpm build
```

**Verify**:

- `pnpm lint` exits 0.
- `pnpm test` exits 0. Total = pre-existing 509 tests + 10 new SEC-02 tests. Test-types
  (`test/types.test-d.ts`) must still pass — this is the guardrail against accidentally breaking
  the `JoinURLResult` generic.
- `pnpm build` exits 0 and regenerates the `joinURL` / `withBase` sections in `README.md` from the
  updated JSDoc. Inspect the diff:

```
git diff README.md
```

Confirm the two examples added in Step 5 now appear in the rendered README. If automd did **not**
update the README, invoke STOP #5.

### Step 7: Add CHANGELOG entry

If a `CHANGELOG.md` exists at the repo root, add an entry at the top under an "Unreleased" heading
(create the heading if it doesn't exist):

```markdown
## Unreleased

### Security

- **Breaking (default)**: `joinURL` and `withBase` now normalize a leading `//` in the concatenated
  result to a single `/` to prevent open-redirect via a protocol-relative payload when the base is
  empty or `"/"`. Callers who genuinely need protocol-relative construction must pass the new
  `{ allowProtocolRelative: true }` option. Example:
  - Before: `joinURL("", "//attacker.com")` → `"//attacker.com"`
  - After:  `joinURL("", "//attacker.com")` → `"/attacker.com"`
  - After:  `joinURL("", "//host", { allowProtocolRelative: true })` → `"//host"`
  - Base already carrying a scheme or `//` prefix is unaffected:
    `joinURL("//cdn.example/", "a")` → `"//cdn.example/a"` (unchanged).
  Related prior art: `#335` (equivalent hardening in `withoutBase`).
```

If **no** `CHANGELOG.md` exists at repo root (`ls CHANGELOG.md` returns not-found), skip this step
and record the same text in the commit body — the release process is `changelogen`-driven and
will pick it up.

**Verify**: `git status` shows only in-scope files modified (see Done criteria).

### Step 8: Update the plan index

Edit `advisor-plans/README.md` and flip the 003 row from `TODO` to `DONE`.

**Verify**: `grep '^| 003 ' advisor-plans/README.md` shows `DONE`.

## Test plan

New tests, all in string form — no `fetch`, no `redirect`, no DOM rendering:

- **`test/join.test.ts`** — new `describe("joinURL — SEC-02 leading '//' normalization")` block
  with 5 cases (Step 2 above).
- **`test/base.test.ts`** — new `describe("withBase — SEC-02 leading '//' normalization")` block
  with 5 cases (Step 2 above).

Test structural pattern: model the new `describe` blocks after `test/base.test.ts:65-69` (the
existing "Collapse leading `//` to prevent protocol-relative URL injection" cases in `withoutBase`).

Every test file must carry the comment:
`// Test strings model the attack pattern; no rendering side-effect is invoked.`

Verification: `pnpm test` → all pass. Before-and-after count: `509 → 519` tests (10 new).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; 10 new SEC-02 tests present and passing (`grep -n "SEC-02" test/join.test.ts test/base.test.ts` returns matches in both files)
- [ ] `pnpm build` exits 0 and `git diff README.md` shows the two new JSDoc examples rendered
- [ ] Direct probe: `node -e "import('./dist/index.mjs').then(m => { console.log(m.joinURL('', '//attacker.com/x')); console.log(m.withBase('//attacker.com/x', '/')); })"` prints `/attacker.com/x` twice (not `//attacker.com/x`)
- [ ] `git status --short` shows changes only in the in-scope set: `src/utils.ts`, `test/join.test.ts`, `test/base.test.ts`, `README.md`, and optionally `CHANGELOG.md` + `advisor-plans/README.md`
- [ ] `src/_types.ts` is **not** modified by this plan (`git diff --stat f06c800..HEAD -- src/_types.ts` shows only the pre-existing in-flight delta, unchanged in this branch's tip commit)
- [ ] `advisor-plans/README.md` row for plan 003 is `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

1. **Drift**: at Step 1, `git diff --stat f06c800..HEAD -- src/utils.ts test/join.test.ts test/base.test.ts` shows any change to those files. The plan is written against `f06c800`; downstream normalization work may already be in flight.
2. **Already fixed**: at Step 2, one of the SEC-02 tests you just added passes on **unpatched** code (i.e. before Steps 3–5). That means someone already landed a fix — record which test passed and stop.
3. **`joinURL` / `withBase` rewritten**: the excerpts in "Current state" don't match the live code. Do not try to guess the new shape — stop.
4. **Type engine collision**: adding the third `joinURL` overload (Step 4) causes `pnpm test:types` errors that trace back to `src/_types.ts` (e.g. `JoinURLResult` failing to infer, `Rest` erroring on non-string members). Do NOT edit `src/_types.ts` — that is owned by the in-flight overload work. Stop and report the exact type-error text.
5. **README not auto-refreshed**: at Step 6, `pnpm build` succeeds but the `joinURL` / `withBase` sections in `README.md` don't include the new SEC-02 examples. Something in the automd pipeline is off — stop rather than hand-editing README, which will be blown away on the next release build.
6. **Verification retry**: any verification command in a step fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **This is a public behavior change** on two very hot functions consumed by Nuxt, Nitro, H3, ofetch, and their ecosystems. Watch the tracker for reports of downstream consumers whose intentional protocol-relative construction broke — the migration is a one-line addition of `{ allowProtocolRelative: true }` at each call site.
- **Reviewer's focus**:
  - The `_normalizeProtocolRelative` helper's decision predicate. The chosen predicate is `hasProtocol(base, { acceptRelative: true })`. Verify:
    - `joinURL("//host/", "a")` — base carries `//`, so `hasProtocol("//host/", { acceptRelative: true })` is `true` → **skip** normalize → result `"//host/a"` preserved.
    - `joinURL("https://host", "a")` — base carries `https:`, so `hasProtocol(..., { acceptRelative: true })` is `true` → skip normalize (moot; result doesn't start with `//` anyway).
    - `joinURL("", "//host")` and `joinURL("/", "//host")` — base has no protocol → normalize → `"/host"`.
  - The runtime options-detection block in `joinURL` — it must not swallow an accidentally-passed non-string as a segment. Confirm arrays are correctly rejected by `!Array.isArray(last)`.
  - The `withBase` return-path uniformity — every return path funnels through `_normalizeProtocolRelative`. Do not "optimize" any branch to bypass it without re-auditing SEC-02.
  - `test/types.test-d.ts` continues to pass unchanged.
- **Interaction with plan 006 (CORR-02/04 `withBase` fragment handling)**: plan 006 will change `withBase` too. Land 003 first; 006's rewrite should preserve the `_normalizeProtocolRelative` funnel on every return path.
- **Interaction with plan 004 (SEC-03/04 WHATWG scheme parity)**: plan 004 rewrites `hasProtocol` predicates. If the `acceptRelative: true` semantic changes there, the helper's predicate must be re-checked.
- **Deferred out of this plan**:
  - Extending the same normalization to `resolveURL` — deferred; `resolveURL` uses the WHATWG `URL` constructor and its `//` semantics are the browser's, not ours to override without a separate audit.
  - Warning-level telemetry (`console.warn` when normalization actually rewrites) — considered and rejected: `ufo` runs in hot render paths where a per-call `console.warn` would be noise. If needed, a future `{ onNormalize: fn }` callback could be added additively.
