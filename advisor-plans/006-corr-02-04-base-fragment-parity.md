# Plan 006: Fix `withBase` / `withoutBase` so a `#fragment` on the input is treated as a URL boundary (CORR-02, CORR-04)

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` if that file exists; if it does not, skip — the advisor maintains the
> index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat f06c800..HEAD -- src/utils.ts test/base.test.ts
> ```
>
> If any in-scope file has changed since this plan was written, compare the "Current state"
> excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — the fix is a two-line extension of an existing whitelist that already includes
  `/` and `?`; the surface is confined to two adjacent functions and one test file.
- **Depends on**: `advisor-plans/001-verification-baseline.md` (installs the `FIXME(CORR-02)` and
  `FIXME(CORR-04)` characterization tests that this plan flips). Runs in parallel with 005, 007.
- **Category**: bug
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`withBase` and `withoutBase` are the pair of primitives every ufo-based framework (Nuxt, Nitro,
`h3`) uses to rewrite URLs at the app-base boundary. They are supposed to be inverses:
`withoutBase(withBase(path, base), base) === path` for any `path` that does not already have a
protocol. Today the pair silently violates that invariant whenever the input carries a
`#fragment`, because the boundary check for "is the char after the base match a URL delimiter?"
whitelists `/` and `?` but omits `#`. Two runtime probes at commit `f06c800`:

```text
withBase("/foo#h", "/foo")    → "/foo/foo#h"   (should be "/foo#h" — base already present)
withoutBase("/foo#h", "/foo") → "/foo#h"       (should be "/#h"   — base should be stripped)
```

The upstream fix in `eb29945 fix(withBase, withoutBase): prevent false prefix matches (#313)`
introduced this exact whitelist to defend against `withBase("/admin-dashboard", "/admin")`
double-prefixing. It correctly added `/` and `?` to the whitelist but overlooked `#`. Plan 006
closes that gap on both sides so `withBase` / `withoutBase` are proper inverses over the
fragment-carrying subset of inputs — the exact class of URL that browser navigation, deep-link
handlers, and single-page-app routers pass through this pair hundreds of times per session.

## Current state

Files the executor will read and touch:

- `src/utils.ts` — `withBase` (lines 335–352) and `withoutBase` (lines 361–388). Contains the two
  `nextChar` whitelist checks that need to grow one entry each. The module already declares
  boundary-adjacent regexes at lines 27–32 (`TRAILING_SLASH_RE`, `JOIN_LEADING_SLASH_RE`); no new
  regex work is required.
- `test/base.test.ts` — the `describe("withBase", …)` and `describe("withoutBase", …)` tables plus
  the `FIXME(CORR-02)` / `FIXME(CORR-04)` blocks that plan 001 appended. This plan flips those
  FIXME cases and adds a new `describe` for the round-trip invariant.

### Excerpt — `withBase` at `src/utils.ts:335-352` (as of `f06c800`)

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

The bug: when `input = "/foo#h"` and `_base = "/foo"`, `nextChar` is `"#"`, which is not in the
`/` / `?` whitelist, so the function falls through to `joinURL(_base, input) === "/foo/foo#h"`.

### Excerpt — `withoutBase` at `src/utils.ts:361-388` (as of `f06c800`)

```ts
export function withoutBase(input: string, base: string) {
  if (isEmptyURL(base)) {
    return input;
  }
  const _base = withoutTrailingSlash(base);
  if (!input.startsWith(_base)) {
    return input;
  }
  // Ensure '/admin-dashboard' is not considered as having base '/admin/'
  const nextChar = input[_base.length];
  if (nextChar && nextChar !== "/" && nextChar !== "?") {
    return input;
  }
  // Collapse leading slashes to prevent protocol-relative URL injection
  // e.g. withoutBase("/legacy//evil.com", "/legacy") must not return "//evil.com"
  const trimmed = input.slice(_base.length).replace(/^\/+/, "");
  return `/${trimmed}`;
}
```

The mirror-image bug: `nextChar === "#"` is treated as "different path", so the input is returned
verbatim without base-stripping.

### Excerpt — `FIXME(CORR-02)` / `FIXME(CORR-04)` blocks that plan 001 appends to `test/base.test.ts`

Plan 001 adds these characterization tests at the tail of `test/base.test.ts`. They pin the
**current (buggy)** behavior so this plan's diff is unambiguous — plan 006 flips the expected
values and removes the `FIXME` comments:

```ts
describe("withBase — fragment characterization", () => {
  it("keeps query-string handling intact (control)", () => {
    expect(withBase("/foo?q=1", "/foo")).toBe("/foo?q=1");
  });
  // FIXME(CORR-02): plan 006 changes this to "/foo#h".
  it("currently double-prefixes the base when a fragment is present (buggy — see FIXME)", () => {
    expect(withBase("/foo#h", "/foo")).toBe("/foo/foo#h");
  });
});

describe("withoutBase — fragment characterization", () => {
  it("strips base from a path with a query string (control)", () => {
    expect(withoutBase("/foo?q=1", "/foo")).toBe("/?q=1");
  });
  // FIXME(CORR-04): plan 006 changes this to "/#h".
  it("currently fails to strip base when a fragment is present (buggy — see FIXME)", () => {
    expect(withoutBase("/foo#h", "/foo")).toBe("/foo#h");
  });
});
```

If plan 001 has **not** merged when this plan runs, the FIXME blocks will not exist yet — see the
STOP conditions and Step 3 for how to handle both orderings.

### Precedent commit

- `eb29945 fix(withBase, withoutBase): prevent false prefix matches (#313)` — added the exact
  `nextChar` whitelist that this plan extends. Match its style: same comment placement, same
  early-return shape, same test-table pattern in `test/base.test.ts`. Read it before starting:
  `git show eb29945`.

### Repo conventions

- **Commit style**: Conventional commits scoped by area. Precedent messages for this class of fix:
  `fix(utils): withBase should keep hash and search #313`, `fix(withBase, withoutBase): prevent
  false prefix matches (#313)`. Use `fix(utils): …` (or `fix(withBase, withoutBase): …`) for the
  source change and `test(base): …` for the test change if committing separately.
- **Zero-dep invariant**: `package.json` declares no runtime deps. Do not add any.
- **Working-tree in-flight work** (per repo `AGENTS.md` and plan 001): uncommitted
  `src/_types.ts` + refined overloads in `src/{index,parse,query,utils}.ts` + a modified
  `test/types.test-d.ts` may be present. **Do not commit that work as part of this plan** — it
  lands independently as v1.7 (direction plan D1). Do not touch `src/_types.ts` or the exported
  overload signatures.

## Commands you will need

| Purpose             | Command                                                         | Expected on success        |
| ------------------- | --------------------------------------------------------------- | -------------------------- |
| Install             | `pnpm install --frozen-lockfile`                                | exit 0                     |
| All tests (runtime) | `pnpm test`                                                     | exit 0, all pass           |
| Focused test file   | `pnpm vitest run test/base.test.ts`                             | exit 0                     |
| Typecheck           | `pnpm vitest --typecheck --run` (or `pnpm build` for a full build) | exit 0                  |
| Build               | `pnpm build`                                                    | exit 0                     |
| Lint                | `pnpm lint`                                                     | exit 0                     |
| Runtime sanity      | `pnpm build && node -e '…'` (see Step 5)                        | outputs match expected     |

## Suggested executor toolkit

- Read the precedent commit before writing any code: `git show eb29945` — the fix shape here is
  the sibling of that fix, one whitelist entry per function.
- No external skills are required for this plan. It is a two-line fix plus tests. If your
  environment offers a `vitest` skill for `it.each` patterns, use it in Step 4.

## Scope

**In scope** (the only files you should modify):

- `src/utils.ts` — extend the `nextChar` whitelist in both `withBase` and `withoutBase` to include
  `"#"`, and (recommended) extract the whitelist to a module-scope helper so both callsites cite a
  single source of truth.
- `test/base.test.ts` — flip the two `FIXME(CORR-02/04)` expected values, remove the `FIXME`
  comments, and add a `describe("withBase / withoutBase — round-trip invariant", …)` block.

**Out of scope** (do NOT touch, even though they look related):

- `src/_types.ts` and the exported overload signatures on `withBase` / `withoutBase` — this is
  the in-flight v1.7 type work; leave whatever is in the working tree untouched. Signature is
  `withBase(input: string, base: string): string` at the value level; no refinement is required
  for this plan.
- Any other function in `src/utils.ts` — this plan's grep of `nextChar` in `src/utils.ts` returns
  exactly 4 matches (lines 349, 351, 380, 381), all inside `withBase` / `withoutBase`. There is
  no third caller to sweep.
- `src/parse.ts` — SEC-02 / protocol-relative normalization is owned by plan 003. Do not fix or
  refactor it here; verify only that this plan does not re-introduce that bug (Step 5).
- All other `src/` files.
- README and any generated API-doc surface — `automd` regenerates it on `pnpm build`; if
  `pnpm build` produces README churn, treat it as expected and include it in the same commit
  (repo convention).

## Git workflow

- Branch: `advisor/006-base-fragment-parity` (create from `main` at `f06c800`, or from the tip if
  plan 001 has already landed on `main`).
- Commit granularity: one commit for the `src/utils.ts` fix + helper extraction, one commit for
  the `test/base.test.ts` flip + round-trip block. A single squashed commit is also acceptable —
  match whatever plan 005 / 007 chose if those merged first.
- Commit-message style: conventional commits (see "Repo conventions" above).
- Do NOT push the branch and do NOT open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Confirm the buggy behavior at HEAD before changing anything

Build the current tree and probe both functions from Node so you're certain you're fixing the
right thing (and not chasing a bug someone else already patched):

```bash
pnpm install --frozen-lockfile
pnpm build
node -e '
  const { withBase, withoutBase } = require("./dist/index.cjs");
  const out = {
    "withBase(/foo#h,/foo)":       withBase("/foo#h", "/foo"),
    "withBase(/foo?q=1,/foo)":     withBase("/foo?q=1", "/foo"),
    "withoutBase(/foo#h,/foo)":    withoutBase("/foo#h", "/foo"),
    "withoutBase(/foo?q=1,/foo)":  withoutBase("/foo?q=1", "/foo"),
  };
  console.log(JSON.stringify(out, null, 2));
'
```

**Expected (buggy) output at `f06c800`**:

```json
{
  "withBase(/foo#h,/foo)": "/foo/foo#h",
  "withBase(/foo?q=1,/foo)": "/foo?q=1",
  "withoutBase(/foo#h,/foo)": "/foo#h",
  "withoutBase(/foo?q=1,/foo)": "/?q=1"
}
```

Note: the `?q=1` cases are already correct today; only the `#h` cases are broken. If **either**
`#h` case already prints the fixed value below, treat it as the "already fixed" STOP condition.

### Step 2: Extract a shared `URL_BOUNDARY_CHARS` helper in `src/utils.ts`

Add a module-scope constant + tiny predicate directly below the existing regex block at lines
27–32 (before `isRelative`). This is the "single source of truth" pattern the maintenance-notes
section commits to for future `with*` / `without*` additions.

Insert (adjust surrounding blank lines to match repo style):

```ts
// URL_BOUNDARY_CHARS enumerates the characters that terminate a path segment in a URL,
// i.e. those that can legitimately follow a base match in `withBase` / `withoutBase`.
// Adding "#" here closes CORR-02 / CORR-04 (see plan 006). Keep this in sync when
// adding new `with*` / `without*` helpers that need base-boundary detection.
const URL_BOUNDARY_CHARS = new Set(["/", "?", "#"]);

function isAtBaseBoundary(input: string, baseLen: number): boolean {
  if (input.length === baseLen)
    return true; // exact match — end of input is a boundary
  return URL_BOUNDARY_CHARS.has(input[baseLen]!);
}
```

**Verify**: file parses.

```bash
pnpm vitest run test/base.test.ts 2>&1 | tail -5
```

Expected: all existing tests still pass (the helper is not yet wired in, so behavior is
unchanged). If tests fail here, you have a syntax error in the insertion — fix it before Step 3.

### Step 3: Rewire both `withBase` and `withoutBase` to use `isAtBaseBoundary`

Replace the two `nextChar` conditionals in place. The behavior change is exactly: `"#"` is now
treated identically to `"/"` and `"?"` (a legitimate URL boundary).

In `withBase` (`src/utils.ts:335-352`) replace:

```ts
if (input.startsWith(_base)) {
  const nextChar = input[_base.length];
  // Ensure '/admin-dashboard' is not considered as having base '/admin/'
  if (!nextChar || nextChar === "/" || nextChar === "?") {
    return input;
  }
}
```

with:

```ts
if (input.startsWith(_base) && isAtBaseBoundary(input, _base.length)) {
  // Ensure '/admin-dashboard' is not considered as having base '/admin/'.
  // Boundary chars: "/", "?", "#" (see URL_BOUNDARY_CHARS). This also closes
  // CORR-02 — a fragment on the input must not defeat the "base already
  // present" check. See plan 006 in advisor-plans/.
  return input;
}
```

In `withoutBase` (`src/utils.ts:361-388`) replace:

```ts
// Ensure '/admin-dashboard' is not considered as having base '/admin/'
const nextChar = input[_base.length];
if (nextChar && nextChar !== "/" && nextChar !== "?") {
  return input;
}
```

with:

```ts
// Ensure '/admin-dashboard' is not considered as having base '/admin/'.
// Boundary chars: "/", "?", "#" (see URL_BOUNDARY_CHARS). This also closes
// CORR-04 — a fragment on the input must not defeat the "starts with base"
// check. See plan 006 in advisor-plans/.
if (!isAtBaseBoundary(input, _base.length)) {
  return input;
}
```

Do **not** touch the `.replace(/^\/+/, "")` + `return "/" + trimmed` tail of `withoutBase`; that
is the SEC-02-adjacent protocol-relative safety net added in commit `5cd9e67 fix(withoutBase):
collapse leading slashes (#335)` and it must stay verbatim.

**Verify**:

```bash
grep -c "URL_BOUNDARY_CHARS" src/utils.ts
grep -c "isAtBaseBoundary"   src/utils.ts
grep -c "nextChar"           src/utils.ts
```

Expected: `URL_BOUNDARY_CHARS` → `1`, `isAtBaseBoundary` → `3` (1 declaration + 2 call sites),
`nextChar` → `0`. If `nextChar` still returns any matches, you missed a callsite — search the
whole file with the grep tool and complete the migration.

```bash
pnpm vitest run test/base.test.ts 2>&1 | tail -30
```

Expected: the pre-existing 24 table-driven tests (10 `withBase` + 14 `withoutBase` at `f06c800`)
still pass. The plan-001 `FIXME(CORR-02/04)` blocks — if present — **now fail** with:

- `withBase("/foo#h", "/foo")` returned `"/foo#h"`, expected `"/foo/foo#h"` (plan-001 expected the
  buggy value).
- `withoutBase("/foo#h", "/foo")` returned `"/#h"`, expected `"/foo#h"` (same).

That is the expected consequence of the fix — plan 001 pinned the buggy values on purpose, and
this plan flips them. Move on to Step 4 to update the tests. If the FIXME blocks are NOT present
(plan 001 has not merged), you will see no new failures — that is also fine; Step 4 still
applies.

### Step 4: Flip the `FIXME(CORR-02/04)` blocks and add the round-trip invariant test

Open `test/base.test.ts`. If plan 001 has landed, replace the two FIXME blocks — remove the
`FIXME(...)` comments and swap in the fixed expected values. If plan 001 has **not** landed, add
the flipped blocks fresh at the tail of the file (they become net-new tests, no FIXME markers).

Target end-state — append (or, if the FIXME blocks exist, transform) to look like this:

```ts
describe("withBase — fragment characterization", () => {
  it("keeps query-string handling intact (control)", () => {
    expect(withBase("/foo?q=1", "/foo")).toBe("/foo?q=1");
  });
  it("does not double-prefix the base when a fragment is present", () => {
    // CORR-02 regression guard. See advisor-plans/006-*.
    expect(withBase("/foo#h", "/foo")).toBe("/foo#h");
  });
});

describe("withoutBase — fragment characterization", () => {
  it("strips base from a path with a query string (control)", () => {
    expect(withoutBase("/foo?q=1", "/foo")).toBe("/?q=1");
  });
  it("strips base from a path with a fragment", () => {
    // CORR-04 regression guard. See advisor-plans/006-*.
    expect(withoutBase("/foo#h", "/foo")).toBe("/#h");
  });
});
```

Then add a round-trip invariant `describe` at the end of the file:

```ts
import { describe, expect, it, test } from "vitest";
// ^ if the file only imports `describe, expect, test`, add `it` — vitest exposes both.

describe("withBase / withoutBase — round-trip invariant over path shapes", () => {
  // For a "well-formed" path — one that begins with "/" and therefore round-trips
  // through withoutBase's leading-slash normalization — withoutBase(withBase(p, b), b) === p.
  //
  // Suffix-only inputs ("#f" alone, "?q" alone) do NOT satisfy strict equality because
  // withoutBase always prepends "/" (a compatibility rule locked in by the existing
  // { base: "/api", input: "/api?test", out: "/?test" } test). Those cases are asserted
  // via a normalized comparison below and are intentionally not part of the strict matrix.
  const strictPaths = ["/", "/a", "/a?q=1", "/a#f", "/a?q#f", "/a/b#f"];
  const bases = ["/", "/a", "/a/b"];

  for (const p of strictPaths) {
    for (const b of bases) {
      it(`round-trip: p=${JSON.stringify(p)}, b=${JSON.stringify(b)}`, () => {
        expect(withoutBase(withBase(p, b), b)).toBe(p);
      });
    }
  }

  // Documented deviations — suffix-only inputs pick up a leading "/" on the withoutBase
  // side. Asserted so any future refactor that "fixes" this becomes a visible, deliberate
  // breaking change rather than silent drift. See plan 006 maintenance notes.
  it("suffix-only fragment: withoutBase adds a leading slash (documented deviation)", () => {
    expect(withoutBase(withBase("#f", "/a"), "/a")).toBe("/#f");
  });
  it("suffix-only query: withoutBase adds a leading slash (documented deviation)", () => {
    expect(withoutBase(withBase("?q", "/a"), "/a")).toBe("/?q");
  });
});
```

Notes for the executor:

- Do **not** modify the pre-existing table cases at the top of `test/base.test.ts`. The
  non-regression requirement is that every one of those cases still passes verbatim — including
  `{ base: "/api", input: "/api?test", out: "/?test" }` and the four `/legacy//evil.com` cases
  added in `5cd9e67`.
- The round-trip block deliberately splits the matrix into `strictPaths` (paths with a leading
  `/`) and the two suffix-only deviations. This is because `withoutBase` unconditionally
  prepends `/` (see `return "/" + trimmed;` at the tail of the function). Rewriting that
  behavior is a breaking change and is **not** part of this plan.

**Verify**:

```bash
pnpm vitest run test/base.test.ts 2>&1 | tail -20
grep -c 'FIXME(CORR-02)' test/base.test.ts
grep -c 'FIXME(CORR-04)' test/base.test.ts
```

Expected: all tests pass (the pre-existing 24 + 4 characterization + 18 strict round-trip + 2
documented deviations = 48 tests total, give or take depending on whether plan 001 had merged).
Both `FIXME` greps return `0` — the markers are gone.

### Step 5: SEC-02 non-regression probe

Confirm that this plan has not undone plan 003's protocol-relative-URL fix (if 003 landed) and
has not introduced new open-redirect surface (if 003 has not landed):

```bash
pnpm build
node -e '
  const { withBase, withoutBase } = require("./dist/index.cjs");
  console.log("SEC-02 probe (with fragment):");
  console.log("  withBase(//attacker.com#h, /):     ", JSON.stringify(withBase("//attacker.com#h", "/")));
  console.log("  withoutBase(/legacy//evil.com, /legacy):", JSON.stringify(withoutBase("/legacy//evil.com", "/legacy")));
  console.log("  withoutBase(/legacy//evil.com#h, /legacy):", JSON.stringify(withoutBase("/legacy//evil.com#h", "/legacy")));
'
```

Expected outcomes:

- If plan 003 has **landed**: `withBase("//attacker.com#h", "/")` returns whatever safe form plan
  003 chose (likely `"/attacker.com#h"` — normalized to a single leading slash). The two
  `withoutBase` cases return `"/evil.com"` and `"/evil.com#h"` respectively (matches the
  `5cd9e67` locked-in behavior for the fragment-free case, extended to `#h`).
- If plan 003 has **not** landed: `withBase("//attacker.com#h", "/")` returns
  `"//attacker.com#h"` (the pre-existing SEC-02 bug — this plan does not fix it, and does not
  need to). The two `withoutBase` cases still return `"/evil.com"` / `"/evil.com#h"` because the
  `.replace(/^\/+/, "")` collapse from `5cd9e67` is intact.

In neither case should this plan **introduce** a new `//`-prefixed return. If it does, you have
accidentally broken the `.replace(/^\/+/, "")` line in `withoutBase` — revert and re-apply
Step 3.

### Step 6: Full-repo verification

```bash
pnpm test
pnpm build
pnpm lint
```

Expected: all three exit 0. The full runtime suite (509 tests green at `f06c800`, plus whatever
plan 001 and any parallel plans added) all pass. The `automd`-driven README diff produced by
`pnpm build` is expected and should be committed with the source change (see Repo conventions).

## Test plan

New / modified tests, all in `test/base.test.ts`:

- **Flipped**: `describe("withBase — fragment characterization", …)` — control (`?q=1`) still
  passes; the `#h` case now expects `"/foo#h"` (was `"/foo/foo#h"`), `FIXME` comment removed.
- **Flipped**: `describe("withoutBase — fragment characterization", …)` — control (`?q=1`) still
  passes; the `#h` case now expects `"/#h"` (was `"/foo#h"`), `FIXME` comment removed.
- **New**: `describe("withBase / withoutBase — round-trip invariant over path shapes", …)` —
  `strictPaths × bases = 6 × 3 = 18` cases asserting
  `withoutBase(withBase(p, b), b) === p`, plus 2 documented-deviation cases for suffix-only
  inputs (`#f`, `?q`).

Structural pattern: model the `it.each` shape after the existing top-of-file `for (const t of
tests) { test(…) }` idiom in `test/base.test.ts` — a plain nested `for` loop with a
`describe`/`it` inside. Do not introduce `vitest`'s `it.each` if the file does not already use
it (it doesn't at `f06c800`).

Non-regression assertions (all must already pass without modification):

- Every row of the existing `withBase` and `withoutBase` tables in `test/base.test.ts`,
  including `{ base: "/api", input: "/api?test", out: "/?test" }` and the four
  `/legacy//evil.com` cases from `5cd9e67`.
- `pnpm test` (the full 509-test baseline).
- The plan-001 characterization tests (except the two FIXME blocks this plan flips) and any
  other plan's tests that have landed.

Verification: `pnpm vitest run test/base.test.ts` → all pass, then `pnpm test` → all pass.

## Done criteria

Machine-checkable. **All** must hold:

- [ ] `pnpm test` exits 0. Test-count delta vs. `f06c800 + plan 001` is `+20` (18 round-trip +
      2 deviations) minus 0 removed. If plan 001 has not merged, delta is `+24` (adds the 4
      characterization tests as well).
- [ ] `pnpm build` exits 0. Any README churn produced by `automd` is included in the same commit
      as the source change.
- [ ] `pnpm lint` exits 0.
- [ ] `grep -n 'nextChar' src/utils.ts` returns no matches (whitelist logic has been moved to
      `URL_BOUNDARY_CHARS` / `isAtBaseBoundary`).
- [ ] `grep -c 'URL_BOUNDARY_CHARS' src/utils.ts` returns `1`.
- [ ] `grep -c 'isAtBaseBoundary' src/utils.ts` returns `3` (declaration + 2 callsites).
- [ ] `grep -c 'FIXME(CORR-02)' test/base.test.ts` returns `0`.
- [ ] `grep -c 'FIXME(CORR-04)' test/base.test.ts` returns `0`.
- [ ] Runtime probe from Step 1 now prints `"/foo#h"` for `withBase("/foo#h", "/foo")` and
      `"/#h"` for `withoutBase("/foo#h", "/foo")`.
- [ ] SEC-02 probe from Step 5 returns the same value for
      `withBase("//attacker.com#h", "/")` as for `withBase("//attacker.com", "/")` on the same
      HEAD — i.e. this plan did not change the protocol-relative behavior in either direction.
- [ ] `git status` shows changes limited to `src/utils.ts` and `test/base.test.ts` (plus the
      auto-regenerated README if `pnpm build` was run — that's fine). No other files touched.
      In particular, `src/_types.ts` is unchanged.
- [ ] `advisor-plans/README.md` status row for plan 006 updated to `DONE`.

## STOP conditions

Stop and report back (do not improvise) if any of the following occur:

- **Drift** — The drift check in the executor-instructions box shows changes to `src/utils.ts`
  since `f06c800`, and the "Current state" excerpts of `withBase` / `withoutBase` no longer match
  the live code (someone rewrote the functions).
- **Already fixed** — The Step 1 probe returns `"/foo#h"` for `withBase("/foo#h", "/foo")`
  and/or `"/#h"` for `withoutBase("/foo#h", "/foo")` before you change anything. Someone landed
  this fix independently — do not re-do it; verify `advisor-plans/README.md` and mark the row
  `REJECTED` with a one-line rationale citing the commit that fixed it.
- **Missing in-flight work** — At session start, `src/_types.ts` does NOT exist in the working
  tree (the repo `AGENTS.md` and plan 001 both assert it should be there uncommitted). If it is
  missing, the environment is not in the state this plan was written for — stop and confirm with
  the operator before proceeding.
- **SEC-02 regression** — The Step 5 probe returns a `//`-prefixed value from `withoutBase` (any
  case). That means you accidentally broke the `.replace(/^\/+/, "")` line inherited from
  `5cd9e67`. Revert `src/utils.ts` and re-apply Step 3 more carefully.
- **A step's verification fails twice** after a reasonable fix attempt.
- **Plan 003 conflict** — If plan 003 has landed and its rewrite of `withBase` moved the
  `startsWith` / `nextChar` block into a different shape than the excerpt in "Current state",
  do NOT force this plan's diff on top. Read plan 003's final `withBase` body, verify the
  boundary check is still `"/"` + `"?"` only, and apply the equivalent one-character extension
  (add `"#"`). Note the sequence in the commit message. If plan 003's shape is
  incompatible with a mechanical extension, stop and report.
- **`strictPaths` matrix has an unexpected failure** — one of the 18 asserted round-trips fails
  after the fix. That indicates a deeper bug in `withBase` / `withoutBase` (e.g. `joinURL`
  behavior on `/a/b#f`) — capture the failing `(p, b, actual, expected)` tuple and report back
  rather than moving the case to the "deviations" block silently. **Any failing combination is
  documented, not silently accepted.**

## Maintenance notes

For the reviewer / next maintainer:

- **What a reviewer should scrutinize**: the diff should be tiny (≈15 lines in `src/utils.ts`
  including the new helper and comments; ≈40 lines in `test/base.test.ts`). Verify that both
  `nextChar` sites are gone (`grep -n 'nextChar' src/utils.ts` → 0 matches) and that
  `URL_BOUNDARY_CHARS` is the single source of truth. Reject any diff that inlines a fourth
  copy of the whitelist somewhere.
- **Suffix-only deviations are intentional.** The strict `withoutBase(withBase(p, b), b) === p`
  invariant fails for `p ∈ {"#f", "?q"}` because `withoutBase` always prepends `"/"` (see
  `return "/" + trimmed;` at the tail of the function, and the existing locked-in test
  `{ base: "/api", input: "/api?test", out: "/?test" }`). This plan documents that behavior in
  the test suite rather than "fixing" it — changing that would be a breaking change and belongs
  in a separate direction plan (see D3 below).
- **URL_BOUNDARY_CHARS reuse**: any future addition to the `with*` / `without*` family that
  needs to detect "am I at a base-segment boundary" should reuse `URL_BOUNDARY_CHARS` /
  `isAtBaseBoundary`. Explicitly do **not** re-inline a `nextChar === "/"` style check — that
  is how this bug (and #313) got there in the first place.
- **Sequence with plan 003 (SEC-02)**: if plan 003 has not landed at merge time, the
  `withBase("//attacker.com#h", "/")` case still returns `"//attacker.com#h"` — plan 006 does
  NOT try to fix it. That is plan 003's remit; log the residual behavior in the plan-003 status
  row so it is caught there.
- **Follow-ups explicitly deferred out of this plan**:
  - **D3 `withoutQuery` symmetry**: batch-2 direction plan. When added, `withoutQuery` will NOT
    need `URL_BOUNDARY_CHARS` (it is a suffix-strip operation with a different shape) but the
    "keep fragment attached" principle applies. See `advisor-plans/README.md` "Batch 2" notes.
  - **Strict-inverse round-trip over suffix-only inputs** — would require dropping the
    always-prepend-`/` rule in `withoutBase`, which is a breaking change to the existing
    `/api?test` → `/?test` contract. Explicitly deferred to a separate breaking-change plan; do
    not sneak it in as part of a subsequent maintenance pass.
