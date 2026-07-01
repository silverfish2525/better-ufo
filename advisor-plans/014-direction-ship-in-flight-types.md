# Plan 014: Ship in-flight type-level refinements + `withoutQuery` as ufo v1.7.0

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f06c800..HEAD -- src/_types.ts src/index.ts src/parse.ts src/query.ts src/utils.ts test/types.test-d.ts tsconfig.json`.
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.
>
> **Working-tree drift check (special)**: this plan's payload is the **uncommitted** in-flight
> work already sitting in the working tree at `f06c800`. Run `git status --short` — you MUST see
> the un-tracked / modified files listed in "Current state" below. If you do not, STOP (see STOP
> conditions).

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `001-verification-baseline.md` (CI `--typecheck`), `008-tsconfig-extreme-strict.md` (loose dependency — Stage 2 CAN land under the current tsconfig; the type engine was authored assuming strict semantics, so 008 landing alongside is preferable)
- **Category**: direction
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

Four direction findings from the audit (D1, D2, D3, D6) all converge on one release-worthy arc:
finalize the uncommitted template-literal type engine (`src/_types.ts`), extend its coverage to the
remaining plain-`string`-returning functions, ship the small missing API symmetry
(`withoutQuery`), and clean up stale `TODO` markers. Bundling these into one coherent v1.7.0
release avoids spreading the "type-safety upgrade" story across three minor versions and gives
downstream consumers a single upgrade to reason about (additive-only public d.ts changes + one new
function). The in-flight `src/_types.ts` is ~445 LOC of template-literal machinery
(`IsStringLiteral<S>`, `ParseQuery<S>`, `WithProtocol<S,P>`, etc.) plus refined overloads on
`parseURL` / `parseQuery` / `withProtocol` / `withHost` / `withHttp` / `withHttps` /
`stringifyQuery` / `encodeQueryItem` / `joinURL` / `withQuery` — leaving it uncommitted risks bit-rot
and a divergence between what the source says and what `dist/index.d.ts` publishes.

## Current state

### Uncommitted working-tree payload (as of `f06c800`, 2026-07-01)

Confirmed via `git status --short`:

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

- `src/_types.ts` — **NEW, 445 LOC, ~13.8 KB**. Template-literal type engine. Not re-exported wholesale from the barrel; only curated helper types are re-exported from `src/index.ts`. Head of the file:

  ```ts
  // src/_types.ts:1-50
  /**
   * Type-level utilities for ufo.
   *
   * Every function in ufo is a pure `string -> string` (or `string -> struct`)
   * transform, which makes the whole surface an ideal target for template-literal
   * types. ...
   */

  export type IsStringLiteral<S> = [S] extends [string]
    ? string extends S ? false : true
    : false;

  export type Refine<S extends string, Computed, Base = string>
    = IsStringLiteral<S> extends true ? Computed : Base;
  ```

  Types exported (per grep of `^export type`): `IsStringLiteral`, `Refine`, `AllStringLiteral`,
  `IsUrlSafe`, `WithLeadingSlash`, `WithoutLeadingSlash`, `WithTrailingSlash`,
  `WithoutTrailingSlash`, `HasLeadingSlash`, `HasTrailingSlash`, `IsRelative`, `WithProtocol`,
  `WithFragment`, `WithoutFragment`, `WithoutHost`, `StringifyQuery`, `StringifyQueryResult`,
  `WithQueryResult`, `JoinURL`, `JoinURLResult`, `ParsePath`, `ParseURL`, `ParseFilename`,
  `ParsedURLBase`, plus `UnionToIntersection`, `UnionToTuple`, `ParseQuery` helpers.

- `src/index.ts` — **MODIFIED**. The current in-flight state **DOES** re-export a curated set of
  type-level helpers from `_types.ts`:

  ```ts
  // Public type-level helpers (extreme type-safety surface)
  export type {
    HasLeadingSlash,
    HasTrailingSlash,
    IsRelative,
    IsStringLiteral,
    IsUrlSafe,
    JoinURL,
    JoinURLResult,
    ParsedURLBase,
    ParseFilename,
    ParsePath,
    ParseURL,
    StringifyQuery,
    StringifyQueryResult,
    WithFragment,
    WithLeadingSlash,
    WithoutFragment,
    WithoutHost,
    WithoutLeadingSlash,
    WithoutTrailingSlash,
    WithProtocol,
    WithQueryResult,
    WithTrailingSlash,
  } from "./_types";
  // src/index.ts (in-flight)
  export * from "./encoding";
  export * from "./parse";
  export * from "./query";
  export * from "./url";
  
  export * from "./utils";
  ```

  This is a **decision point** in Stage 2 (see Step 2.4).

- `src/parse.ts`, `src/query.ts`, `src/utils.ts` — **MODIFIED**. Refined overloads added in the
  established `function foo<const S extends string>(input: S): Refine<S, FooResult<S>>; function foo(input: string): string; function foo(input: string) { ... }` pattern. Exemplar (`src/utils.ts:842-849`):

  ```ts
  export function withoutFragment<const S extends string>(
    input: S,
  ): Refine<S, WithoutFragment<S>>;
  export function withoutFragment(input: string): string;
  export function withoutFragment(input: string): string {
    return stringifyParsedURL({ ...parseURL(input), hash: "" });
  }
  ```

  Match this pattern for all Stage 3 additions and Stage 4's `withoutQuery`.

- `test/types.test-d.ts` — **MODIFIED**. In-flight version has 219 LOC / 18 type-level tests
  covering the refined overloads (uses vitest's `expectTypeOf` / `assertType`; verified via
  `vitest run --typecheck` which is the default `pnpm test` here).

- `tsconfig.json` — **MODIFIED**. Contains a **spurious `strict: true` addition**. `strict` is the
  default in TypeScript 6.0.3 (this repo pins `typescript: ^6.0.3` in `devDependencies`). The
  current state:

  ```json
  {
    "compilerOptions": {
      "target": "ESNext",
      "module": "ESNext",
      "esModuleInterop": true
    },
    "include": ["src"]
  }
  ```

  If a diff shows `strict: true` was added, remove it in Stage 2 Step 2.1. If it is not present in
  the working tree, note that in the commit message and skip that removal.

- `package.json` — **MODIFIED**. Likely only pinned devDep versions / lockfile-consequent bumps.
  Do NOT touch as part of this plan except for the `version` bump in the final step (Step 5.2).

### Baseline facts

- ufo `unjs/ufo@1.6.4` at commit `f06c800`. This plan proposes shipping the accumulated
  type-safety + `withoutQuery` work as **v1.7.0** (minor bump — additive only, no runtime behavior
  changes).
- 509 runtime tests green under `vitest run --typecheck`; 0 type errors under current tsconfig.
- Node package manager: **pnpm 10.33.2** (see `package.json` `packageManager` field).
- `sideEffects: false`; single-entry barrel export at `src/index.ts`.
- Build: `automd && unbuild` (`pnpm build`). `automd` regenerates the `<!-- automd:jsdocs
  src=./src defaultGroup=utils -->` block in `README.md` from JSDoc on public functions.
- Test: `pnpm test` runs `pnpm lint && vitest run --typecheck` (so `pnpm test` includes lint AND
  type-level tests via vitest 4.x `--typecheck`).
- Lint: `pnpm lint` (`eslint . && prettier -c src test`).
- Commit style: **conventional commits** (see `git log --oneline`: `chore(release): v1.6.4`,
  `fix(withoutBase): collapse leading slashes (#335)`).

### Stale `TODO` markers found in `src/` (relevant to Stage 1)

```
src/query.ts:51:  // TODO: Use new EmptyObject() instead of Object.create(null) for better performance in next major version
src/utils.ts:497:      // TODO: Handle .. when joining
```

- `src/utils.ts:497` — sits inside `joinURL`'s hot loop. `joinRelativeURL` (later in the same
  file) already handles `..`. This TODO is stale and must be resolved in Stage 1.
- `src/query.ts:51` — explicitly scoped "in next major version" and is a perf micro-opt, NOT a
  bug. Leave it in place; optionally re-scope its wording (see Step 1.2).

### `withoutQuery` precedent (Stage 4)

The `with*` / `without*` family in `src/utils.ts` is asymmetric: `withQuery` exists but
`withoutQuery` does not. The precise structural precedent is `withoutFragment` (`src/utils.ts:836-848`)
and `withoutHost` (`src/utils.ts:855-867`) — both were added to close the same kind of gap.

## Commands you will need

| Purpose               | Command                              | Expected on success                                |
| --------------------- | ------------------------------------ | -------------------------------------------------- |
| Install               | `pnpm install`                       | exit 0                                             |
| Full test (lint + typecheck + runtime) | `pnpm test`                | exit 0; 509 pre-existing runtime tests pass; 18+ type-level tests pass |
| Runtime tests only    | `pnpm exec vitest run`               | exit 0                                             |
| Type-level tests only | `pnpm exec vitest run --typecheck`   | exit 0                                             |
| Lint only             | `pnpm lint`                          | exit 0                                             |
| Build (dist + README) | `pnpm build`                         | writes `dist/index.{mjs,cjs,d.ts}` + regenerates README's `<!-- automd:jsdocs -->` block |
| Grep stale markers    | `grep -rn "TODO\|FIXME\|XXX" src/`   | after Stage 1: only `src/query.ts:51` remains (or its re-scoped variant) |
| Working-tree audit    | `git status --short`                 | (see Current state)                                |
| d.ts inspection       | `less dist/index.d.ts`               | contains both base + refined overloads for each Stage-2 function |

## Suggested executor toolkit

- Skill `vitest` (`/Users/i584843/.pi/agent/skills/vitest/SKILL.md`) — for the `expectTypeOf` and
  `assertType` patterns used in `test/types.test-d.ts`.
- Skill `typescript-strict-migrator` — only if Stage 2 surfaces strictness assumptions that break
  under the current (non-strict-flagged) tsconfig.
- The plan template at `.agents/skills/improve/references/plan-template.md` (already followed
  here; no need to re-read).

## Scope

**In scope** (the only files you should modify):

- `src/_types.ts` (finalize — probably no changes; extend in Stage 3/4 only if needed)
- `src/index.ts` (finalize + Stage 4 `withoutQuery` re-export via `export * from "./utils"`)
- `src/parse.ts` (finalize refinements)
- `src/query.ts` (finalize refinements + Stage 1 comment cleanup if you touch it)
- `src/utils.ts` (finalize refinements + Stage 1 TODO cleanup + Stage 4 `withoutQuery`)
- `test/types.test-d.ts` (extend — Stage 3 & Stage 4 type tests)
- `test/utilities.test.ts` (extend — Stage 4 `withoutQuery` runtime tests)
- `tsconfig.json` (remove spurious `strict: true` if present)
- `package.json` (version bump to `1.7.0` in Step 5.2 only — nothing else)
- `README.md` (regenerated by `automd` on `pnpm build`; do NOT hand-edit inside the
  `<!-- automd:jsdocs -->` fence)
- `CHANGELOG.md` (generated by `changelogen`; do NOT hand-edit)

**Out of scope** (do NOT touch, even though they look related):

- Any `$URL` class change — plan `011-tech-debt-refactor.md` Stage 3 owns the deprecation
  timeline.
- Any security / correctness fix — plans `002` through `007` own those.
- Any perf hoist (e.g. `JOIN_SEGMENT_SPLIT_RE`) — plan `010-perf-hot-paths.md` owns it.
- Splitting `utils.ts` or breaking the `parse` ↔ `utils` cycle — plan `011` owns it.
- Public export of internal type utilities like `ParseQuery`, `UnionToIntersection`,
  `UnionToTuple`, `AllStringLiteral`, `Refine` (helper machinery — keep internal). See Step 2.4
  for the exact allowed re-export list.
- URL template builder (`buildURL<"/users/:id">({ id: "u1" })`) — deferred to v2 design spike. See
  Maintenance notes.
- ATC / SAP / abap-fs anything (unrelated).

## Git workflow

- Branch: `advisor/014-v1.7-in-flight-types-ship` (create with `git checkout -b advisor/014-v1.7-in-flight-types-ship` from `f06c800` or current `main` HEAD if it still points at `f06c800`).
- Commit per stage using **conventional commits** (this repo's convention — see `git log`).
  Suggested subjects:
  - Stage 1: `chore: resolve stale TODO in joinURL and rescope query TODO`
  - Stage 2: `feat(types): template-literal refinements for parseURL/parseQuery/withProtocol/etc.`
  - Stage 3: `feat(types): extend literal-input refinement to withBase/withoutBase/joinRelativeURL/resolveURL/normalizeURL`
  - Stage 4: `feat(utils): add withoutQuery for API symmetry with withQuery`
  - Stage 5 (release prep): `chore(release): v1.7.0`
- Do NOT push and do NOT open a PR unless the operator instructed it. Do NOT run
  `pnpm release` (that publishes to npm). Stop at "branch ready, commits made, tests green".

## Steps

### Stage 1 — Resolve stale `TODO` markers (finding D6)

#### Step 1.1: Remove the stale `joinURL` TODO

**File**: `src/utils.ts:497` (inside `joinURL`'s loop).

**Current shape** (verified against `f06c800`):

```ts
// src/utils.ts:493-503
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
```

**Action**: Delete the `// TODO: Handle .. when joining` line entirely. `joinRelativeURL` (also
in `src/utils.ts`, later in the file) already handles `..` — the TODO is stale and misleading.
Deletion is cleaner than a `@see` redirect because the comment is inside a loop body, not on a
public JSDoc block. Do NOT add a replacement comment.

**Verify**:

```bash
grep -n "TODO: Handle .. when joining" src/utils.ts
```

Expected: no output (exit code 1).

#### Step 1.2: Audit remaining `TODO` / `FIXME` / `XXX` markers

Run:

```bash
grep -rn "TODO\|FIXME\|XXX" src/
```

Expected remaining hits after Step 1.1:

```
src/query.ts:51:  // TODO: Use new EmptyObject() instead of Object.create(null) for better performance in next major version
```

**Action for `src/query.ts:51`**: leave in place. It is explicitly scoped to "next major version"
and is a perf micro-optimization, not a bug. Optionally rewrite its wording to the convention
`TODO(v2): <justification>` used by other unjs packages — but if you touch it, the diff must be
comment-only. Do NOT change the surrounding code. If unsure, leave it exactly as-is.

**Verify**:

```bash
grep -rn "TODO\|FIXME\|XXX" src/ | wc -l
```

Expected: `1` (or `1` if you re-scoped the wording — still one line).

#### Step 1.3: Commit Stage 1

```bash
git add src/utils.ts src/query.ts  # only if 1.2 was rescoped
git commit -m "chore: resolve stale TODO in joinURL and rescope query TODO"
```

**Verify**: `git log --oneline -1` shows the new commit.

---

### Stage 2 — Finalize in-flight `_types.ts` and refined overloads (finding D1)

#### Step 2.1: Remove spurious `strict: true` from `tsconfig.json`

Open `tsconfig.json`. If it contains `"strict": true` inside `compilerOptions`, remove that line.
`strict` is the default in TypeScript 6.0.3 (this repo's pin); its explicit addition here is a
signal of confusion, not a semantic change. If `strict: true` is NOT present, note that in the
commit body and skip this micro-step.

**Target shape** (matches the pre-in-flight baseline at `f06c800`):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

**Verify**:

```bash
grep -c '"strict"' tsconfig.json
```

Expected: `0`.

Then confirm the change did not silently break the type layer:

```bash
pnpm exec vitest run --typecheck
```

Expected: exit 0, all pre-existing type-level tests pass.

#### Step 2.2: Review `src/_types.ts` for correctness invariants

Read `src/_types.ts` end-to-end. Verify (visual inspection — do not modify unless a violation is
found):

1. **Every** refined overload in `src/{parse,query,utils}.ts` uses `Refine<S, ...>` (or an
   equivalent explicit `IsStringLiteral<S> extends true ? Computed : Base` check). Grep to
   audit:

   ```bash
   grep -rn "<const S extends string>" src/
   ```

   For each hit, verify the following overload line returns either `Refine<S, ...>` or `string`
   (base overload).

2. **No public overload widens the base signature.** For each refined function, the second
   overload MUST still be `function foo(input: string): string;` (or the pre-existing base
   signature — unchanged types, unchanged parameter list). If any base overload differs from the
   pre-`f06c800` shape, that is a **STOP condition** (widening / narrowing the base breaks
   downstream typing).

3. **No leakage of implementation-only helpers into public d.ts.** Helpers like
   `UnionToIntersection`, `UnionToTuple`, `Refine`, `AllStringLiteral`, `ParseQuery` are internal
   plumbing. They may be `export type` in `src/_types.ts` (for `d.ts` composition inside the
   bundle), but they MUST NOT appear in the curated re-export block at the bottom of
   `src/index.ts`. See Step 2.4 for the exact allowed public surface.

**Verify**: no code change in this step — inspection only. Record any violation in a scratch
`SCRATCH.md` at the repo root; if `SCRATCH.md` exists at the end of this stage, that is a STOP
condition.

#### Step 2.3: Run the full build and inspect `dist/index.d.ts`

```bash
pnpm install   # in case package.json / lockfile drift
pnpm build
```

Expected: `dist/index.{mjs,cjs,d.ts}` written; `README.md`'s `<!-- automd:jsdocs -->` block is
regenerated (`git diff README.md` will show it).

Then inspect `dist/index.d.ts`. For each of the refined functions listed below, confirm BOTH
overloads are emitted (grep for the function name and count `export function <name>` /
`export declare function <name>` occurrences — expect **2**):

- `parseURL`
- `parseQuery`
- `withProtocol`
- `withHost`
- `withHttp`
- `withHttps`
- `stringifyQuery`
- `encodeQueryItem`
- `joinURL`
- `withQuery`
- `withFragment`, `withoutFragment` (already refined pre-plan; sanity check)
- `withoutHost` (already refined pre-plan; sanity check)

For each, verify the **base** overload signature (the second one) is unchanged from
`f06c800`'s emitted `dist/index.d.ts` at v1.6.4. Fetch the published v1.6.4 typings for reference:

```bash
mkdir -p /tmp/ufo-1.6.4 && cd /tmp/ufo-1.6.4 \
  && pnpm pack ufo@1.6.4 --pack-destination . \
  && tar -xzf ufo-1.6.4.tgz \
  && diff <(grep "^export declare function parseURL" package/dist/index.d.ts) \
          <(grep "^export declare function parseURL" /Users/i584843/SAPDevelop/dev/ufo/dist/index.d.ts | tail -1)
cd -
```

Expected `diff`: **empty** (base overload unchanged). Repeat for each function above. If ANY diff
is non-empty on a base overload, that is a **STOP condition**.

#### Step 2.4: Decide the curated public re-export surface in `src/index.ts`

**Advisor recommendation**: keep the internal machinery internal. The refined overloads on the
public functions ARE the public surface; downstream consumers benefit automatically. However, the
in-flight `src/index.ts` already re-exports 22 helper types. Two viable executor choices:

- **Option A (advisor-preferred, breaking pre-release)** — trim the re-export block to helper
  types genuinely useful to consumers writing their own type-level wrappers:
  - Keep: `IsStringLiteral`, `WithProtocol`, `WithFragment`, `WithoutFragment`, `WithoutHost`,
    `JoinURL`, `ParseURL`, `ParsePath`, `ParseFilename`, `ParsedURLBase`,
    `WithLeadingSlash`, `WithoutLeadingSlash`, `WithTrailingSlash`, `WithoutTrailingSlash`,
    `HasLeadingSlash`, `HasTrailingSlash`, `IsRelative`.
  - Remove: `IsUrlSafe`, `StringifyQuery`, `StringifyQueryResult`, `WithQueryResult`,
    `JoinURLResult` (internal result carriers — surface leakage). Also do NOT add `Refine`,
    `AllStringLiteral`, `UnionToIntersection`, `UnionToTuple`, `ParseQuery` — internal only.
- **Option B (ship-what-you-have, conservative)** — keep the exact in-flight re-export block.
  Safer if there is any downstream code (even internal to unjs) that has started referencing the
  wider set. Because nothing is shipped yet (v1.6.4 does not export any of these), Option A is
  safe from a semver standpoint too.

**Executor pick**: **Option A**. Update `src/index.ts` to remove the five `Result`-suffixed and
`IsUrlSafe` types from the re-export block. If a subsequent `pnpm build` fails because those
removed types are referenced by other kept types (unlikely — they are result types), fall back to
Option B and note the fallback in the Stage 2 commit message.

**Verify**:

```bash
pnpm build
```

Expected: exit 0. Then:

```bash
grep -c "^  [A-Z]" src/index.ts     # counts the re-exported type names
```

Expected: **17** under Option A, **22** under Option B.

#### Step 2.5: Check JSDoc-through-overloads (automd regression watch)

`automd` reads JSDoc from source files to regenerate the README's `<!-- automd:jsdocs -->` block.
When a function has an overload chain (`function foo<S>(): Refine<...>; function foo(input: string): string; function foo(input: string) { ... }`), JSDoc placement matters: automd typically
looks at the JSDoc immediately above the **first** exported signature.

Diff the regenerated README against `f06c800` for the functions refined in this stage:

```bash
git diff -- README.md | grep -E "^[+-]" | head -200
```

Verify that for each refined function, the JSDoc description, `@example`, and `@group` still
appear in `README.md`. If any refined function's JSDoc content is missing or truncated in
`README.md`, that is a **STOP condition** (see STOP conditions #4). Suggested source-side fix
(before stopping): move the JSDoc block to sit directly above the first overload signature (not
the implementation signature). Re-run `pnpm build` and re-diff. If still broken, STOP.

#### Step 2.6: Commit Stage 2

```bash
git add src/_types.ts src/index.ts src/parse.ts src/query.ts src/utils.ts \
        test/types.test-d.ts tsconfig.json README.md
git commit -m "feat(types): template-literal refinements for parseURL/parseQuery/withProtocol/etc."
```

**Verify**: `git log --oneline -2` shows Stage 1 and Stage 2 commits; `git status --short` is
clean (empty output).

---

### Stage 3 — Complete type-refinement coverage (finding D2)

Extend refined overloads to the remaining public string-returning functions that are cheap to
refine.

**Candidate list** (attempt in this order, skip any whose refinement machinery would exceed
**~20 LOC in `src/_types.ts`** — note skipped ones in Maintenance):

1. `withBase(input, base)` — return type when both inputs are literals: `\`${Base}${Input}\``
   normalized. Machinery: reuse `WithLeadingSlash` / `WithTrailingSlash` from `_types.ts`.
2. `withoutBase(input, base)` — inverse of `withBase`; refined return type strips the base prefix.
3. `joinRelativeURL(...segments)` — variadic. Refine only when ALL args are literals
   (use `AllStringLiteral<Args>`); fall back to `string` otherwise.
4. `resolveURL(base, ...paths)` — same variadic pattern as `joinRelativeURL`.
5. `normalizeURL(input)` — one-arg literal → normalized literal via existing `WithProtocol` /
   `WithLeadingSlash` primitives.
6. `isEqual(a, b, opts?)` — returns `boolean`; when both `a` and `b` are literals AND `opts` is
   omitted or a literal, may be refinable to `true` / `false` literal. **Skip** if the refinement
   requires more than ~20 LOC or if it requires case-normalization type math (likely does — the
   options include `trailingSlash`, `leadingSlash`, `queryOrder`, `queryFilter`; too complex).
7. `isSamePath(a, b)` — similarly refinable to `true` / `false` literal when both inputs are
   literals AND there are no options. Simpler than `isEqual`; likely under budget.

For each function you refine:

- **Add** a `<const S extends string>` (or `<const A extends string, const B extends string>` for
  two-arg) refined overload above the base overload.
- **Add** the corresponding `export type <FnName><...> = ...` in `src/_types.ts` if not already
  present.
- **Add** ONE type-level test in `test/types.test-d.ts` per newly-refined function. Structural
  pattern to match: the existing tests already in the file — search for
  `expectTypeOf(parseURL(` for the shape.

**For each function, run:**

```bash
pnpm exec vitest run --typecheck
```

Expected: exit 0; test count increases by exactly the number of new tests you added.

**Scope-limiter (hard cap)**: if `_types.ts` grows by more than **~100 LOC** across this stage
(measure with `git diff --stat src/_types.ts`), stop adding refinements. Note the deferred ones
in the Stage 3 commit message body and in this plan's Maintenance section.

**Commit Stage 3**:

```bash
git add src/_types.ts src/parse.ts src/query.ts src/utils.ts test/types.test-d.ts README.md
git commit -m "feat(types): extend literal-input refinement to withBase/withoutBase/joinRelativeURL/resolveURL/normalizeURL"
```

(Adjust the commit subject to match which functions were actually refined.)

**Verify**:

```bash
pnpm test
```

Expected: exit 0; test count = 509 pre-existing runtime tests + (18 + N) type-level tests where
N is the number of Stage 3 refinements shipped.

---

### Stage 4 — Add `withoutQuery` (finding D3)

#### Step 4.1: Implement `withoutQuery` in `src/utils.ts`

Add the function immediately after `withQuery` (grep for `export function withQuery` to locate;
place `withoutQuery` right after the closing `}` of `withQuery`'s implementation). Match the
JSDoc and overload shape used by `withoutFragment` (`src/utils.ts:836-848`).

**Target shape** (implementation is byte-precise; the JSDoc must sit directly above the FIRST
signature so automd picks it up — see Step 2.5):

```ts
/**
 * Removes the query string from a URL, preserving path and fragment.
 *
 * @example
 *
 * ```js
 * withoutQuery("https://a.com/b?x=1#h")
 * // Returns "https://a.com/b#h"
 * ```
 *
 * @group utils
 */
export function withoutQuery<const S extends string>(
  input: S,
): Refine<S, WithoutQuery<S>>;
export function withoutQuery(input: string): string;
export function withoutQuery(input: string): string {
  const qIdx = input.indexOf("?");
  if (qIdx === -1)
    return input;
  const hIdx = input.indexOf("#", qIdx);
  if (hIdx === -1)
    return input.slice(0, qIdx);
  return input.slice(0, qIdx) + input.slice(hIdx);
}
```

Import `Refine` and `WithoutQuery` at the top of `src/utils.ts` (extend the existing import from
`./_types`).

#### Step 4.2: Add `WithoutQuery<S>` type in `src/_types.ts`

Add near the other `Without*` types (search for `export type WithoutFragment` and place
`WithoutQuery` adjacent). Sketch (executor may improve, but this is the minimal viable form):

```ts
/**
 * Strip the query string (`?...`) from a URL literal, preserving path and
 * fragment. Base + fragment are re-joined losslessly.
 */
export type WithoutQuery<S extends string>
  = S extends `${infer Head}?${infer Rest}`
    ? Rest extends `${string}#${infer Frag}`
      ? `${Head}#${Frag}`
      : Head
    : S;
```

**If** this refinement, plus its test, plus any adjacent helper, adds more than ~20 LOC to
`_types.ts`, ship the runtime function with only the base `string` return type (no refined
overload). Note the deferred refinement in Maintenance.

#### Step 4.3: Export from `src/index.ts`

`src/index.ts` already has `export * from "./utils";`, so `withoutQuery` is auto-exported. No
change needed. If Option A from Step 2.4 was chosen, do NOT add `WithoutQuery` to the curated
type re-export block (internal helper, not consumer-facing).

**Verify**:

```bash
pnpm build && grep -c "export declare function withoutQuery" dist/index.d.ts
```

Expected: **2** (two overloads).

#### Step 4.4: Add runtime tests in `test/utilities.test.ts`

Locate `test/utilities.test.ts` (grep for a `describe("withoutFragment"` block for the structural
pattern). Add a `describe("withoutQuery", ...)` block covering **exactly these cases** (do not
add speculative extras):

1. **No-query input** — identity: `withoutQuery("https://a.com/b") === "https://a.com/b"`.
2. **Query only** — strip: `withoutQuery("https://a.com/b?x=1") === "https://a.com/b"`.
3. **Query + fragment** — strip query, keep fragment:
   `withoutQuery("https://a.com/b?x=1#h") === "https://a.com/b#h"`.
4. **Fragment only** — identity: `withoutQuery("https://a.com/b#h") === "https://a.com/b#h"`.
5. **Empty input** — identity: `withoutQuery("") === ""`.

Add one edge check: relative path with query:
`withoutQuery("/foo?x=1") === "/foo"`.

#### Step 4.5: Add type-level test in `test/types.test-d.ts`

Match the structural pattern of the existing `withoutFragment` type test (grep the file).
Minimum shape:

```ts
import { expectTypeOf } from "vitest";
import { withoutQuery } from "../src";

// baseline: dynamic string stays `string`
expectTypeOf(withoutQuery(("https://a.com/b?x=1" as string))).toEqualTypeOf<string>();

// refined: literal input yields refined literal type
expectTypeOf(withoutQuery("https://a.com/b?x=1#h")).toEqualTypeOf<"https://a.com/b#h">();
```

(If Step 4.2 was skipped due to the ~20-LOC cap, drop the "refined" `expectTypeOf` line.)

#### Step 4.6: Regenerate README and inspect

```bash
pnpm build
```

Verify `withoutQuery` now appears in the `<!-- automd:jsdocs -->` block of `README.md`:

```bash
grep -A 6 "^### `withoutQuery`" README.md
```

Expected: the JSDoc description and `@example` block are present. If NOT present, apply the JSDoc
positional fix from Step 2.5 (move JSDoc directly above the first overload signature) and
re-run.

#### Step 4.7: Commit Stage 4

```bash
git add src/_types.ts src/utils.ts test/types.test-d.ts test/utilities.test.ts README.md
git commit -m "feat(utils): add withoutQuery for API symmetry with withQuery"
```

**Verify**:

```bash
pnpm test
```

Expected: exit 0.

---

### Stage 5 — Release prep (v1.7.0)

**This stage is release-adjacent but stops SHORT of `npm publish`.** Do not run `pnpm release`
(that command runs `pnpm test && changelogen --release && npm publish && git push --follow-tags`
— publishing is out of scope for this plan).

#### Step 5.1: Regenerate `CHANGELOG.md` locally (dry-run friendly)

```bash
pnpm exec changelogen --from v1.6.4 --to HEAD
```

Inspect the generated changelog entries. Confirm:

- Under `### 🚀 Enhancements`: entries for `feat(types): ...` (Stage 2 & 3) and
  `feat(utils): add withoutQuery ...` (Stage 4).
- Under `### 🏡 Chore`: entry for the Stage 1 TODO cleanup.

Do NOT commit the changelog yourself. `changelogen --release` (run later at actual release time)
will bump the version, update the changelog, tag, and commit atomically.

#### Step 5.2: Bump the version manually if the operator asked for a release-ready commit

Only if the operator explicitly said "prepare the release commit" — otherwise skip. If asked:

```bash
# Edit package.json: "version": "1.6.4" → "1.7.0"
git add package.json CHANGELOG.md
git commit -m "chore(release): v1.7.0"
```

Do NOT create a git tag. Do NOT push. Do NOT publish.

#### Step 5.3: Final verification

```bash
pnpm install && pnpm test && pnpm build
```

Expected: all three exit 0.

```bash
git log --oneline f06c800..HEAD
```

Expected: 4 or 5 commits (Stage 1–4, plus optional Stage 5.2).

```bash
git status --short
```

Expected: empty output.

---

## Test plan

- **Stage 1**: no new tests; `pnpm test` remains green (509 runtime + 18 type-level = pre-plan
  baseline).
- **Stage 2**: no new tests (the in-flight `test/types.test-d.ts` already carries the 18
  type-level tests for the refined overloads). `pnpm exec vitest run --typecheck` must pass — this
  is where the refinement is actually enforced.
- **Stage 3**: **one type-level test per newly-refined function** in `test/types.test-d.ts`.
  Model after the existing `parseURL`/`withProtocol` test blocks in the same file.
- **Stage 4**: **~5 runtime tests + 1 type-level test** for `withoutQuery`. Runtime tests in
  `test/utilities.test.ts` (structural model: the existing `withoutFragment` describe block);
  type test in `test/types.test-d.ts`.
- **Final gate**: `pnpm test && pnpm build` both exit 0. `dist/index.d.ts` contains both
  overloads for every refined function. `README.md` contains a JSDoc entry for `withoutQuery`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 (lint + typecheck + runtime, 509 runtime + at least 18 + Stage-3-count + 1 type-level tests).
- [ ] `pnpm build` exits 0; `dist/index.{mjs,cjs,d.ts}` regenerated.
- [ ] `grep -rn "TODO: Handle .. when joining" src/` returns nothing.
- [ ] `grep -c "\"strict\"" tsconfig.json` returns `0`.
- [ ] `grep -c "^export declare function withoutQuery" dist/index.d.ts` returns `2`.
- [ ] `grep -c "^### \`withoutQuery\`" README.md` returns `1`.
- [ ] `git log --oneline f06c800..HEAD` shows 4 conventional-commit-style commits (or 5 with the optional release-prep commit).
- [ ] No files outside the in-scope list are modified (`git status --short` is empty after all commits).
- [ ] For each refined function in Stage 2, the BASE overload in `dist/index.d.ts` matches the v1.6.4 published `dist/index.d.ts` byte-for-byte on that specific signature line.
- [ ] `advisor-plans/README.md` status row for plan 014 updated (see "Update README" below).

## STOP conditions

Stop and report back (do not improvise) if:

1. **Payload missing**: at the start of Stage 2, `git status --short` does NOT show `?? src/_types.ts` (or the file does not exist). The in-flight type-safety work is this plan's entire Stage 2 payload — its absence means someone reset the working tree and this plan cannot execute as written.
2. **Base overload changed**: Stage 2 Step 2.3's `diff` of any base overload against v1.6.4's published `dist/index.d.ts` is non-empty. Refinement is required to be **purely additive**; any base-overload change is a public API break.
3. **Plan 001 not landed AND CI silently skipping `--typecheck`**: verify `pnpm test` includes `vitest run --typecheck` (the current `package.json` shows `"test": "pnpm lint && vitest run --typecheck"` — this is the required shape). If a CI config exists (`.github/workflows/*.yml`) and shows `--typecheck` explicitly stripped or missing, STOP and land plan 001 first. Do not proceed to Stage 3 or 4 without CI-level enforcement.
4. **automd JSDoc regression**: Stage 2 Step 2.5 or Stage 4 Step 4.6 shows `README.md` missing JSDoc content for a refined or newly-added function. Apply the source-side JSDoc-position fix (JSDoc directly above the first overload signature) and retry. If still broken after one fix attempt, STOP and investigate `automd` config in `package.json` / `.automd.mjs` (if present).
5. **Stage 3 refinement over budget**: `_types.ts` grew by more than ~100 LOC in Stage 3 (`git diff --stat src/_types.ts` on Stage 3 commit shows growth). STOP adding refinements, land what fits, and note the rest in Maintenance.
6. **Downstream references removed by Option A**: Stage 2 Step 2.4 Option A caused `pnpm build` to fail because a removed re-export was transitively referenced. Fall back to Option B (keep all 22 re-exports); do NOT press through with Option A by adding new suppressions.
7. **Any verification command fails twice in a row after a reasonable fix attempt.**
8. **A step's fix appears to require touching an out-of-scope file** (e.g. a `src/encoding.ts` change, a `src/url.ts` change to the `$URL` class, or a security-adjacent regex tweak that belongs in plans 002–007).

When stopping, write a short note in the plan's row in `advisor-plans/README.md` — `BLOCKED: <one-line reason>` — and report to the operator.

## Update `advisor-plans/README.md`

The plan index at `advisor-plans/README.md` does NOT currently have a row for plan 014. Add one to
the status table (immediately after plan 011). Suggested row:

```
| 014  | Ship in-flight type-level refinements + `withoutQuery` as v1.7.0 | P1       | L      | 001 (008 soft) | direction     | TODO       |
```

Update the "Batch 2 (plans 009+ — TBD)" section: remove "D1 (finalize + ship `_types.ts` as v1.7),
D3 (`withoutQuery` symmetry)" from the "Direction" bullet — they are now plan 014.

At the end of execution, flip this plan's status from `TODO` to `DONE`.

## Maintenance notes

For the human/agent who owns this code after v1.7.0 ships:

- **v1.7.0 release notes** should call out:
  1. **Additive-only public d.ts changes** — every refined function now has a
     literal-input overload that yields a computed literal return type; dynamic-string callers
     see the identical base signature as v1.6.4. No consumer code needs to change.
  2. **New `withoutQuery(input)` function** — closes the asymmetry with `withQuery`, mirrors
     the `withoutHost` / `withoutFragment` precedent from v1.5.
  3. **Type-level query-string parsing** — `parseQuery("?a=1&b=2")` returns a struct with
     literal keys `"a"` / `"b"` when called with a string literal.
- **`src/query.ts:51` TODO** (Object.create → EmptyObject perf micro-opt) — deliberately left
  in place. Address in a future major (v2) when the runtime-perf plan revisits query parsing.
- **Deferred to v2 (D5 — URL template builder)**: `buildURL<"/users/:id">({ id: "u1" })` typed
  as `"/users/u1"`. The template-literal decomposition machinery already exists in
  `src/_types.ts` (search for the `Split` / `Segments` helpers around lines 333–349 of the
  in-flight file) — a v2 spike can leverage it. This was intentionally scoped out of v1.7 to
  keep the release additive-only and small.
- **Deferred (percent-encoding-aware refinement)**: current type-level refinements treat all
  characters uniformly. A future refinement could type-check reserved-char encoding at build
  time. Requires expanding `IsUrlSafe` machinery in `_types.ts`; non-trivial.
- **Deferred Stage-3 refinements** (if the ~100-LOC budget capped Stage 3 short): whichever of
  `isEqual` / `isSamePath` / `resolveURL` / `normalizeURL` was skipped is documented in that
  stage's commit body; carry forward as a follow-up plan.
- **PR reviewer scrutiny**:
  1. Diff `dist/index.d.ts` against v1.6.4's published typings — every base overload MUST match.
  2. Grep the PR for `IsStringLiteral` — every refined overload MUST use it (directly or via `Refine`).
  3. Confirm `test/types.test-d.ts` has both a "dynamic string stays base type" and a "literal
     yields refined type" expectation for each new refinement.
  4. Confirm `README.md`'s `automd` block was regenerated (there will be diff lines) and none of
     the pre-existing JSDoc content is lost.
