# Plan 011: Split `src/utils.ts` monolith, break the parse↔utils circular import, extract a `modifyParsedURL` helper, and publish a written `$URL` v2 deprecation timeline

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **This plan is INTENTIONALLY OPTIONAL**. It delivers zero user-visible behavior change. It is
> pure maintenance-burden reduction. It is organised into **three independent stages**, each landing
> as its own commit. **You MAY stop after any stage** and still leave the tree in a healthy state.
> Do not feel pressure to complete all three — Stage 1 alone is a legitimate landing point, so is
> Stages 1+2, so is Stages 1+3.
>
> **Drift check (run first)**:
> `git diff --stat f06c800..HEAD -- src/utils.ts src/parse.ts src/index.ts src/url.ts`
> If any file listed above changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.
> Additionally, this plan was written assuming the uncommitted `_types.ts` + overload work is still
> present in the working tree (see STOP conditions). If it has already been committed and merged,
> that is fine — the plan still applies; the STOP condition merely no longer needs to guard against
> collision.

## Status

- **Priority**: P3
- **Effort**: L (Stage 2 dominates; Stages 1 and 3 are S each)
- **Risk**: MED (Stage 2 large diff, potential for accidental import cycles or `dist/` shape drift; Stages 1 and 3 are LOW)
- **Depends on**: `001-verification-baseline.md` (hard — need the characterization tests before we start moving code around). Softly depends on `005-*`, `006-corr-02-04-base-fragment-parity.md`, `007-corr-03-06-parseauth-opaque-schemes.md` — better to land those correctness fixes first so the file split does not collide with in-flight semantic edits. If any of 005/006/007 are still TODO, prefer to sequence them before Stage 2 of this plan; Stage 1 and Stage 3 are safe to run regardless.
- **Category**: tech-debt
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`src/utils.ts` is 868 LOC — 4.6× the next-largest source file (`src/parse.ts` at 254 LOC). Recent
git history shows this one file dominates merge friction: nearly every non-trivial feature or fix
touches it. It also holds a value-level circular import with `src/parse.ts` that only works because
of ESM hoisting; any future top-level side effect on either side would deadlock. Separately, five
functions in `utils.ts` implement the same parse→mutate→stringify pattern by hand — an obvious
extraction the codebase has not yet performed. And `$URL` has been marked `@deprecated` for two
years with no written v2 timeline, so downstream consumers cannot plan migrations. None of these
change runtime behavior; all of them lower the cost of future change. Landing this plan makes the
codebase easier to modify for every subsequent audit-plan executor, and gives Nuxt/Nitro/H3/ofetch
maintainers a concrete `$URL` sunset schedule they can point PRs at.

## Current state

### Files in scope, with their role

- `src/utils.ts` (868 LOC) — monolithic utils module. All functions carry a `@group utils` JSDoc tag
  and there are natural seams (slash / protocol / join / query-ops / fragment / base / host /
  predicates / normalize) that the split will follow.
- `src/parse.ts` (254 LOC) — contains `parseURL`, `parsePath`, `parseAuth`, `parseHost`,
  `stringifyParsedURL`, `parseFilename` and the `ParsedURL` / `ParsedPath` / `ParsedAuth` /
  `ParsedHost` types.
- `src/index.ts` (31 LOC) — public barrel; re-exports everything from `./encoding`, `./parse`,
  `./query`, `./url`, `./utils` plus a curated list of public type-level helpers from `./_types`.
- `src/url.ts` (148 LOC) — the `$URL` class and `createURL()` factory. Both are `@deprecated`.
- `package.json` — `"exports"` field maps `.` to `./dist/index.{d.ts,mjs,cjs}` and everything else
  through `./*`. There is **no** custom `build.config.ts` — `unbuild` uses its default and picks up
  `src/index.ts` automatically.

### Concrete evidence — the circular import (DEBT-02)

`src/utils.ts:1` (value import — this is the reverse edge):

```ts
import { parseURL, stringifyParsedURL } from "./parse";
```

`src/parse.ts:2` (value import — this is the forward edge):

```ts
import { hasProtocol } from "./utils";
```

Both are runtime (value) imports. ESM hoists them and the module graph currently has no top-level
side effects, so it works — but it is a genuine circular dependency that will show up in
`madge --circular`.

### Concrete evidence — the 5 duplicated parse+mutate+stringify sites (DEBT-08)

All in `src/utils.ts`. Each does exactly `parseURL → mutate one field → stringifyParsedURL`:

1. `src/utils.ts:406-410` — `withQuery`

   ```ts
   const parsed = parseURL(input);
   const mergedQuery = { ...parseQuery(parsed.search), ...query };
   parsed.search = stringifyQuery(mergedQuery);
   return stringifyParsedURL(parsed);
   ```

2. `src/utils.ts:428-436` — `filterQuery`

   ```ts
   const parsed = parseURL(input);
   const query = parseQuery(parsed.search);
   const filteredQuery = Object.fromEntries(
     Object.entries(query).filter(([key, value]) => predicate(key, value)),
   );
   parsed.search = stringifyQuery(filteredQuery);
   return stringifyParsedURL(parsed);
   ```

3. `src/utils.ts:677-683` — `normalizeURL`

   ```ts
   const parsed = parseURL(input);
   parsed.pathname = encodePath(decodePath(parsed.pathname));
   parsed.hash = encodeHash(decode(parsed.hash));
   parsed.host = encodeHost(decode(parsed.host));
   parsed.search = stringifyQuery(parseQuery(parsed.search));
   return stringifyParsedURL(parsed);
   ```

4. `src/utils.ts:821-825` — `withFragment` (the non-early-return branch)

   ```ts
   const parsed = parseURL(input);
   parsed.hash = hash === "" ? "" : `#${encodeHash(hash)}`;
   return stringifyParsedURL(parsed);
   ```

5. `src/utils.ts:846-848` — `withoutFragment` (a one-liner today; extraction is still worthwhile
   for consistency with the other four)

   ```ts
   return stringifyParsedURL({ ...parseURL(input), hash: "" });
   ```

`resolveURL` also uses `parseURL` + `stringifyParsedURL`, but the middle step is a loop that
allocates a fresh `ParsedURL` per iteration, not a single-field mutation. It is **not** a candidate
for `modifyParsedURL` extraction — leave it alone.

### Concrete evidence — the `@deprecated` $URL (DEBT-05)

`src/url.ts:12-14`:

```ts
/**
 * @deprecated use native URL with `new URL(input)` or `ufo.parseURL(input)`
 */
export class $URL implements URL {
```

`src/url.ts:143-146`:

```ts
/**
 * @deprecated use native URL with `new URL(input)` or `ufo.parseURL(input)`
 */
export function createURL(input: string): $URL {
  return new $URL(input);
}
```

Both are two years old (v1.4.0) with no accompanying removal timeline.

### `@group` seams in `src/utils.ts` and the target file map

Every exported symbol in `utils.ts` carries a `@group utils` JSDoc tag today, but the natural
groupings implied by function names are:

| Target file (Stage 2)   | Symbols to move                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/predicates.ts` | `isRelative`, `isEmptyURL`, `isNonEmptyURL`, `isSamePath`, `isEqual` (plus the local `CompareURLOptions` interface)                                                       |
| `src/utils/protocol.ts` | `HasProtocolOptions` interface, `hasProtocol`, `isScriptProtocol`, `withProtocol`, `withHttp`, `withHttps`, `withoutProtocol` (plus the `PROTOCOL_*` regex constants)     |
| `src/utils/slash.ts`    | `hasTrailingSlash`, `withoutTrailingSlash`, `withTrailingSlash`, `hasLeadingSlash`, `withoutLeadingSlash`, `withLeadingSlash` (plus `TRAILING_SLASH_RE`)                  |
| `src/utils/normalize.ts` | `cleanDoubleSlashes`, `normalizeURL`, `resolveURL`                                                                                                                        |
| `src/utils/base.ts`     | `withBase`, `withoutBase`                                                                                                                                                  |
| `src/utils/query-ops.ts`| `withQuery`, `filterQuery`, `getQuery`                                                                                                                                     |
| `src/utils/join.ts`     | `joinURL`, `joinRelativeURL` (plus `JOIN_LEADING_SLASH_RE`)                                                                                                                |
| `src/utils/fragment.ts` | `withFragment`, `withoutFragment`                                                                                                                                          |
| `src/utils/host.ts`     | `withoutHost`                                                                                                                                                              |
| `src/utils/_modify.ts`  | `modifyParsedURL` (INTERNAL — not re-exported from `src/utils.ts`). Underscore prefix marks it non-public. Introduced in Stage 1, moved here in Stage 2.                   |

After Stage 2, `src/utils.ts` becomes a barrel that re-exports the public names above so
`src/index.ts`'s `export * from "./utils"` continues to work unchanged.

### Repo conventions in play

- **Conventional Commits**. Look at `git log --oneline -20` for the style — commits like
  `fix: …`, `feat: …`, `refactor: …`, `docs: …`, `chore: …`. Stage 1 is `refactor:`, Stage 2 is
  `refactor:`, Stage 3 is `docs:`.
- **Do NOT push branches or open PRs unless the operator explicitly requests it.** Local commits
  only.
- **Never commit the uncommitted `_types.ts` in-flight work as part of this plan.** That is v1.7
  direction plan D1 and lands separately. See STOP conditions.
- **`sideEffects: false`** and `"exports": { ".": ... }` mean the file split is invisible to
  consumers — everyone imports from `"ufo"`, which resolves to `dist/index.mjs`. The barrel is what
  makes the split safe.
- **Overloaded functions**. Many `utils.ts` symbols have both a generic overload and a plain
  overload (e.g. `withQuery` at lines 401-406). When you move a symbol you MUST move **all** its
  overload signatures together, in the same order, above the implementation signature. Do not
  collapse overloads.
- **Type-only vs value imports**. When moving symbols, prefer `import type { … }` for names used
  only in type positions to keep the runtime graph minimal.

## Commands you will need

| Purpose                     | Command                              | Expected on success                                       |
| --------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Install                     | `pnpm install`                       | exit 0                                                    |
| Full test + typecheck + lint | `pnpm test`                         | exit 0; ≥509 tests pass (vitest 4, `--typecheck`)         |
| Build                       | `pnpm build`                         | exit 0; regenerates `dist/index.{mjs,cjs,d.ts}` and README |
| Lint only                   | `pnpm lint`                          | exit 0                                                    |
| Circular-import check       | `pnpm dlx madge --circular src/`     | exit 0; "No circular dependency found!" (Stage 2 gate)    |
| Diff `dist/index.d.ts`      | See Stage 2 procedure                | zero changes or trivial re-ordering only                  |
| Working-tree check          | `git status --porcelain`             | Only in-scope files listed                                |

## Suggested executor toolkit

- No special skills required. This is straightforward mechanical refactoring plus one Markdown doc.
- The `codebase-design` skill vocabulary ("deep module", "seam") is relevant when reasoning about
  Stage 2 but is not required.
- Do NOT run any SAP-related MCP tools; this repo is `unjs/ufo`, an OSS JavaScript library.

## Scope

**In scope** (the only files you should create or modify):

- Stage 1:
  - `src/utils.ts` — edit in place; introduce `modifyParsedURL` helper and route the 5 sites through it.
- Stage 2:
  - `src/utils.ts` — reduce to a barrel of re-exports.
  - `src/utils/predicates.ts` (new)
  - `src/utils/protocol.ts` (new)
  - `src/utils/slash.ts` (new)
  - `src/utils/normalize.ts` (new)
  - `src/utils/base.ts` (new)
  - `src/utils/query-ops.ts` (new)
  - `src/utils/join.ts` (new)
  - `src/utils/fragment.ts` (new)
  - `src/utils/host.ts` (new)
  - `src/utils/_modify.ts` (new — internal, moved from utils.ts)
  - `src/parse.ts` — may need one import-path adjustment if the value-cycle to `./utils` is
    resolved by importing directly from `./utils/protocol` (see Stage 2, Step 2.4).
  - `test/public-api.test.ts` (create) — smoke test asserting every documented public symbol resolves
    via the `"ufo"` package name.
- Stage 3:
  - `docs/v2-plan.md` (new).
  - `advisor-plans/README.md` — status row for plan 011 updated to DONE.

**Out of scope** (do NOT touch, even though they look related):

- `src/_types.ts` and any `_types.ts` restructuring — that's direction plan D1 / D2.
- `test/types.test-d.ts` — part of the in-flight overload work, leave alone.
- `src/url.ts` — Stage 3 is doc-only. Do NOT change the `$URL` class or `createURL()`. Do NOT
  un-deprecate. Do NOT add new getters. If you believe the class needs code changes, STOP and
  escalate (see STOP conditions).
- Any semantic change to functions — that's plans 005/006/007/009.
- Adding `withoutQuery`, `mapQuery`, `pickQuery`, `omitQuery` or any other public API — see plans
  014 / direction.
- `dist/` shape (public d.ts signatures, function arity, exported names) — must be byte-identical
  except for possible trivial re-ordering.
- `README.md` at repo root — `automd` regenerates the API section on `pnpm build`. If it changes,
  that is expected side-output; but do not hand-edit it.
- The uncommitted in-flight `_types.ts` + overloads work in the working tree.

## Git workflow

- Branch: `advisor/011-tech-debt-refactor` (create at start; do not push).
- One commit per stage. Conventional Commits style, matching `git log --oneline` in this repo:
  - Stage 1: `refactor(utils): extract modifyParsedURL helper for parse+mutate+stringify sites`
  - Stage 2: `refactor(utils): split utils.ts into per-group files under src/utils/`
  - Stage 3: `docs: publish v2 deprecation plan for $URL class`
- Do NOT push. Do NOT open a PR.
- If you stop after Stage 1 or Stage 2, you still leave one or two clean commits on the branch —
  that's fine.

## Steps

### Stage 1 — Extract `modifyParsedURL` helper (S, LOW risk)

Ships first because it is mechanical, small, and reduces `utils.ts` LOC before the Stage 2 split.
No new files, no import changes, no barrel work.

#### Step 1.1: Create the branch and confirm the baseline

```bash
git checkout -b advisor/011-tech-debt-refactor
pnpm install
pnpm test
```

**Verify**: `pnpm test` → exit 0, ≥509 tests pass. If it does not pass on a clean checkout of
`f06c800`, STOP — the baseline is broken, not this plan.

#### Step 1.2: Add the `modifyParsedURL` helper to `src/utils.ts`

Add a private, non-exported helper near the top of `src/utils.ts` (after the existing imports and
regex constants, before `isRelative`). Import `ParsedURL` as a **type** from `./parse`.

Change the existing value import at `src/utils.ts:1` from:

```ts
import { parseURL, stringifyParsedURL } from "./parse";
```

to:

```ts
import type { ParsedURL } from "./parse";
import { parseURL, stringifyParsedURL } from "./parse";
```

(Two import lines — one runtime, one type. Do not merge them, so Stage 2 can move each edge
independently.)

Add the helper:

```ts
/**
 * Internal helper: parse a URL string, apply an in-place mutation to the parsed object,
 * then stringify it back. Not exported.
 */
function modifyParsedURL(
  input: string,
  fn: (parsed: ParsedURL) => void,
): string {
  const parsed = parseURL(input);
  fn(parsed);
  return stringifyParsedURL(parsed);
}
```

**Verify**: `pnpm test` → exit 0. (No callers yet — the helper is dead code but the tree still compiles.)

#### Step 1.3: Route `withQuery` through the helper (`src/utils.ts:406-410`)

Replace the body of the implementation signature of `withQuery` (the third overload, the one that
actually contains logic — the two overload declarations above it stay untouched) with:

```ts
export function withQuery(input: string, query: QueryObject): string {
  return modifyParsedURL(input, (parsed) => {
    parsed.search = stringifyQuery({
      ...parseQuery(parsed.search),
      ...query,
    });
  });
}
```

**Verify**: `pnpm test` → exit 0.

#### Step 1.4: Route `filterQuery` through the helper (`src/utils.ts:424-437`)

Preserve the early-return `if (!input.includes("?")) return input;` guard — it is a fast-path.
Replace only the parse+mutate+stringify block:

```ts
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string {
  if (!input.includes("?")) {
    return input;
  }
  return modifyParsedURL(input, (parsed) => {
    const query = parseQuery(parsed.search);
    const filteredQuery = Object.fromEntries(
      Object.entries(query).filter(([key, value]) => predicate(key, value)),
    );
    parsed.search = stringifyQuery(filteredQuery);
  });
}
```

**Verify**: `pnpm test` → exit 0.

#### Step 1.5: Route `normalizeURL` through the helper (`src/utils.ts:677-683`)

```ts
export function normalizeURL(input: string): string {
  return modifyParsedURL(input, (parsed) => {
    parsed.pathname = encodePath(decodePath(parsed.pathname));
    parsed.hash = encodeHash(decode(parsed.hash));
    parsed.host = encodeHost(decode(parsed.host));
    parsed.search = stringifyQuery(parseQuery(parsed.search));
  });
}
```

**Verify**: `pnpm test` → exit 0.

#### Step 1.6: Route `withFragment` through the helper (`src/utils.ts:821-825`)

Preserve the early-return `if (!hash || hash === "#") return input;` guard. Replace only the
parse+mutate+stringify block:

```ts
export function withFragment(input: string, hash: string): string {
  if (!hash || hash === "#") {
    return input;
  }
  return modifyParsedURL(input, (parsed) => {
    parsed.hash = hash === "" ? "" : `#${encodeHash(hash)}`;
  });
}
```

**Verify**: `pnpm test` → exit 0.

#### Step 1.7: Route `withoutFragment` through the helper (`src/utils.ts:846-848`)

The current one-liner spreads a `ParsedURL` and re-stringifies it. Rewrite to use the helper:

```ts
export function withoutFragment(input: string): string {
  return modifyParsedURL(input, (parsed) => {
    parsed.hash = "";
  });
}
```

**Verify**: `pnpm test` → exit 0.

#### Step 1.8: Full verification and commit

```bash
pnpm lint
pnpm test
pnpm build
git status --porcelain
```

**Verify**:
- `pnpm lint` → exit 0.
- `pnpm test` → exit 0; ≥509 tests pass.
- `pnpm build` → exit 0.
- `git diff dist/index.d.ts` and `git diff dist/index.mjs` → the runtime `dist/index.mjs` diff
  should be small (just the 5 refactored function bodies); `dist/index.d.ts` diff **must be zero**
  because no public signature changed. **If `dist/index.d.ts` has any change, STOP.**
- `git status --porcelain` → the only tracked file changed under `src/` is `src/utils.ts`. (The
  `dist/` diff you have inspected does not need to be committed — `dist/` is generated at publish
  time; check whether it's gitignored via `cat .gitignore | grep dist` before deciding.)

Now revert any generated `dist/` changes so the commit is source-only, and commit:

```bash
git checkout -- dist/ 2>/dev/null || true
git add src/utils.ts
git commit -m "refactor(utils): extract modifyParsedURL helper for parse+mutate+stringify sites"
```

**Stage 1 is complete. You may stop here.** If you stop, update `advisor-plans/README.md`'s status
row for plan 011 to `IN PROGRESS (Stage 1 landed; Stages 2-3 deferred)` and report.

---

### Stage 2 — Split `src/utils.ts` into `src/utils/*.ts` and break the parse↔utils circular import (L, MED risk)

This is the large, risky stage. Proceed only if Stage 1 landed cleanly and `pnpm test` is green.

#### Step 2.1: Confirm the starting state and add `madge` on-demand

```bash
pnpm test
pnpm dlx madge --circular src/
```

**Verify**:
- `pnpm test` → exit 0.
- `pnpm dlx madge --circular src/` → reports at least one cycle involving `parse.ts` and
  `utils.ts`. Record the exact output — it is your Stage 2 baseline. You must reach "No circular
  dependency found!" by the end of Stage 2.

If `madge` cannot resolve the graph (e.g. TypeScript path mapping trips it), pass
`--extensions ts,mts,cts`:

```bash
pnpm dlx madge --extensions ts,mts,cts --circular src/
```

Do NOT add `madge` as a devDependency — one-off `pnpm dlx` invocation is enough for verification.

#### Step 2.2: Create `src/utils/` and the per-group files

For each row in the "target file map" table in the "Current state" section above, create the file
and move (do not copy) the listed symbols out of `src/utils.ts` into it. Preserve each symbol's
JSDoc, all its overload signatures in original order, and its `@group utils` tag.

**Order of file creation (chosen so the DAG stays acyclic at every intermediate state):**

1. `src/utils/predicates.ts` — no dependency on other utils files, only on `./encoding` (for
   `decode` used by `isSamePath`, `isEqual`) and on things it doesn't need from utils. `isSamePath`
   uses `withoutTrailingSlash`; `isEqual` uses `withTrailingSlash` and `withLeadingSlash`. Because
   those will live in `src/utils/slash.ts`, `predicates.ts` will import them from
   `../utils/slash.js` — see step 2.3 for the correct extension policy.
2. `src/utils/slash.ts` — depends only on itself and no other utils module. Includes
   `TRAILING_SLASH_RE`.
3. `src/utils/protocol.ts` — includes `HasProtocolOptions`, the four `PROTOCOL_*` regex constants,
   `hasProtocol`, `isScriptProtocol`, `withProtocol`, `withHttp`, `withHttps`, `withoutProtocol`.
   No dependency on `parse.ts`. **This file is the target for breaking the parse↔utils cycle** —
   `src/parse.ts` will import `hasProtocol` from here directly, not from the barrel.
4. `src/utils/join.ts` — includes `JOIN_LEADING_SLASH_RE`, `joinURL`, `joinRelativeURL`. `joinURL`
   uses `withTrailingSlash` (from `./slash`), `isNonEmptyURL` (from `./predicates`).
   `joinRelativeURL` uses `hasProtocol` (from `./protocol`). Imports go to specific files, not the
   barrel.
5. `src/utils/base.ts` — `withBase`, `withoutBase`. Uses `isEmptyURL` (`./predicates`),
   `hasProtocol` (`./protocol`), `withoutTrailingSlash` (`./slash`), `joinURL` (`./join`).
6. `src/utils/host.ts` — `withoutHost`. Uses `parseURL` from `../parse`.
7. `src/utils/fragment.ts` — `withFragment`, `withoutFragment`. Uses `modifyParsedURL`
   (from `./_modify`) and `encodeHash` (from `../encoding`).
8. `src/utils/query-ops.ts` — `withQuery`, `filterQuery`, `getQuery`. Uses `parseURL`, `ParsedQuery`,
   `parseQuery`, `stringifyQuery` from `../parse` and `../query`, and `modifyParsedURL` from
   `./_modify`.
9. `src/utils/normalize.ts` — `cleanDoubleSlashes`, `normalizeURL`, `resolveURL`. Uses `modifyParsedURL`
   from `./_modify` (for `normalizeURL`), `parseURL` and `stringifyParsedURL` from `../parse`
   directly (for `resolveURL` — the loop pattern), and slash/query helpers.
10. `src/utils/_modify.ts` — the `modifyParsedURL` helper introduced in Stage 1. Move the helper
    definition and its `import type { ParsedURL } from "../parse"` line here. Export it (so the
    other utils files can `import { modifyParsedURL } from "./_modify"`), but do **not** re-export
    it from the barrel — see Step 2.5.

At each intermediate move, run `pnpm test`. Do not batch all moves and hope for the best; keep
`utils.ts` importing from the new file for symbols already moved and defining locally the ones
still to move. The tree stays green after every step.

#### Step 2.3: Import extension policy

The repo is TypeScript source-only, published via `unbuild` which handles `.js` extension
resolution at build time. Look at `src/index.ts:1-5`:

```ts
export * from "./encoding";
export * from "./parse";
export * from "./query";
export * from "./url";
export * from "./utils";
```

**No `.js` extension is used** in this repo's source. Follow that convention — write
`from "./slash"`, `from "../parse"`, etc. Do not add `.js` extensions. If lint (`pnpm lint`) or
typecheck (`vitest run --typecheck` inside `pnpm test`) complains, STOP and re-check the tsconfig
(`moduleResolution`) — do not add extensions blindly.

#### Step 2.4: Break the parse↔utils circular import

After Step 2.2 has finished moving `hasProtocol` into `src/utils/protocol.ts`, change
`src/parse.ts:2` from:

```ts
import { hasProtocol } from "./utils";
```

to:

```ts
import { hasProtocol } from "./utils/protocol";
```

This is the ONLY edit to `src/parse.ts` in this plan. Do not touch anything else in that file.

**Verify** the cycle is gone:

```bash
pnpm dlx madge --extensions ts,mts,cts --circular src/
```

Expected: `✔ No circular dependency found!` (or equivalent madge success message). **If madge
still reports a cycle, STOP** (see STOP conditions).

#### Step 2.5: Reduce `src/utils.ts` to a barrel

Once every symbol has been moved out, replace the entire contents of `src/utils.ts` with a
re-export barrel. Preserve every public export name and their overloads (the overloads live in the
target files now; `export *` picks them up automatically):

```ts
export * from "./utils/base";
export * from "./utils/fragment";
export * from "./utils/host";
export * from "./utils/join";
export * from "./utils/normalize";
// Barrel — public API surface identical to the pre-split monolith.
// New utilities should be added to the appropriate per-group file
// under src/utils/, not appended here. See advisor-plans/011-tech-debt-refactor.md.
export * from "./utils/predicates";
export * from "./utils/protocol";
export * from "./utils/query-ops";
export * from "./utils/slash";
// _modify.ts intentionally NOT re-exported — it is an internal helper.
```

**Verify**:

```bash
pnpm test
pnpm build
```

Both must exit 0. Then diff the built types:

```bash
git stash push -- dist/ 2>/dev/null || true
git checkout f06c800 -- dist/index.d.ts 2>/dev/null || pnpm build
# ^ obtain the pre-split dist/index.d.ts as a reference; if dist/ is gitignored,
#   run this after checkout f06c800 in a separate worktree or scratch dir instead.
```

The correct, portable procedure: check out `f06c800` in a temporary worktree, run `pnpm build`
there, then compare its `dist/index.d.ts` to the current one:

```bash
git worktree add /tmp/ufo-baseline f06c800
cd /tmp/ufo-baseline && pnpm install && pnpm build && cd -
diff /tmp/ufo-baseline/dist/index.d.ts dist/index.d.ts
```

**Verify**: `diff` produces **no output**, or output limited to re-ordering of `export`
declarations (same names, same signatures, only line order changes). **Any added / removed /
renamed symbol, any changed function signature, any changed overload count = STOP.**

Clean up the worktree afterwards:

```bash
git worktree remove /tmp/ufo-baseline
```

#### Step 2.6: Add a public-API smoke test

Create `test/public-api.test.ts` (if it does not already exist — check first with `ls test/`):

```ts
import { describe, expect, it } from "vitest";
import * as ufo from "../src";

describe("public API surface", () => {
  const expected = [
    // parse
    "parseURL",
    "parsePath",
    "parseAuth",
    "parseHost",
    "parseFilename",
    "stringifyParsedURL",
    // query
    "parseQuery",
    "stringifyQuery",
    // url (deprecated but still public)
    "$URL",
    "createURL",
    // encoding
    "encodeHash",
    "encodeHost",
    "encodePath",
    "encodeParam",
    "encodeQueryKey",
    "encodeQueryValue",
    "decode",
    "decodePath",
    "decodeQueryKey",
    "decodeQueryValue",
    // utils — predicates
    "isRelative",
    "isEmptyURL",
    "isNonEmptyURL",
    "isSamePath",
    "isEqual",
    // utils — protocol
    "hasProtocol",
    "isScriptProtocol",
    "withProtocol",
    "withHttp",
    "withHttps",
    "withoutProtocol",
    // utils — slash
    "hasTrailingSlash",
    "withTrailingSlash",
    "withoutTrailingSlash",
    "hasLeadingSlash",
    "withLeadingSlash",
    "withoutLeadingSlash",
    // utils — join
    "joinURL",
    "joinRelativeURL",
    // utils — base
    "withBase",
    "withoutBase",
    // utils — host
    "withoutHost",
    // utils — fragment
    "withFragment",
    "withoutFragment",
    // utils — query-ops
    "withQuery",
    "filterQuery",
    "getQuery",
    // utils — normalize
    "cleanDoubleSlashes",
    "normalizeURL",
    "resolveURL",
  ];

  it.each(expected)("exports %s", (name) => {
    expect((ufo as Record<string, unknown>)[name]).toBeDefined();
  });

  it("does not export the internal modifyParsedURL helper", () => {
    expect((ufo as Record<string, unknown>).modifyParsedURL).toBeUndefined();
  });
});
```

**Before adding**: verify the `expected` list actually matches the pre-split public surface. Run:

```bash
node -e "import('./dist/index.mjs').then(m => console.log(Object.keys(m).sort().join('\n')))"
```

against the baseline (`/tmp/ufo-baseline/dist/index.mjs` from Step 2.5) and compare its output
against the `expected` array above. If the baseline exports something not in the list, ADD it
to the list — do not remove it from the code. If the list has something the baseline does not
export, REMOVE it from the list. The purpose of the test is to catch accidental drift, not to
enumerate a wishlist.

If `test/public-api.test.ts` already exists, extend it rather than overwriting it. Confirm your
symbol list is a superset of anything already tested there.

**Verify**:

```bash
pnpm test
```

Exit 0; all previously passing tests still pass; the new `public-api.test.ts` tests pass.

#### Step 2.7: Final Stage 2 verification and commit

```bash
pnpm lint
pnpm test
pnpm build
pnpm dlx madge --extensions ts,mts,cts --circular src/
git status --porcelain
```

**Verify** all of:
- `pnpm lint` → exit 0.
- `pnpm test` → exit 0; ≥509 + N-new tests (from Step 2.6) pass.
- `pnpm build` → exit 0.
- `madge --circular` → "No circular dependency found!".
- `dist/index.d.ts` diff against the pre-split baseline (from Step 2.5) → empty or trivial-ordering
  only.
- `git status --porcelain` → only in-scope files touched.

Commit:

```bash
git add src/utils.ts src/utils/ src/parse.ts test/public-api.test.ts
git commit -m "refactor(utils): split utils.ts into per-group files under src/utils/

Splits the 868-LOC utils.ts monolith into src/utils/{predicates,slash,protocol,
join,base,host,fragment,query-ops,normalize}.ts. src/utils.ts is now a barrel
re-exporting every public name; the public API surface (dist/index.d.ts) is
unchanged.

Also breaks the value-level circular import parse.ts <-> utils.ts by pointing
parse.ts at src/utils/protocol.ts directly. madge --circular src/ is now clean.

Adds test/public-api.test.ts to guard the public surface against accidental
drift in future refactors.

No behavior change; all 509+ existing tests continue to pass."
```

**Stage 2 is complete. You may stop here.** If you stop, update `advisor-plans/README.md`'s status
row for plan 011 to `IN PROGRESS (Stages 1-2 landed; Stage 3 deferred)` and report.

---

### Stage 3 — Publish the `$URL` v2 deprecation timeline in `docs/v2-plan.md` (S, LOW risk)

Doc-only. No code change. Bakes in "Option A" — a written commitment that `$URL` and `createURL()`
are removed in v2.0.0 — as decided by this plan. If while reading `src/url.ts` you conclude that
Option B (undeprecate + rewrite as immutable builder) is the right call, STOP and escalate; do not
silently switch strategies.

#### Step 3.1: Check whether `docs/` exists

```bash
ls docs/ 2>/dev/null || echo "no docs directory yet"
```

If `docs/` does not exist, create it: `mkdir -p docs`. This is the first Markdown file under
`docs/`; that's fine.

#### Step 3.2: Create `docs/v2-plan.md`

The file MUST contain the following three sections, in this order and with these headings (the
test in Step 3.3 grep-checks the headings):

1. `## Timeline`
2. `## $URL → functional API mapping`
3. `## Breaking changes`

Concrete content to write:

````markdown
# ufo v2 plan — the `$URL` sunset

**Status**: proposed
**Author**: unjs/ufo maintainers
**Last updated**: 2026-07-01
**Baseline commit**: `f06c800`

## Context

`$URL` (in `src/url.ts`) and its factory `createURL()` have been marked
`@deprecated` since v1.4.0. The public JSDoc has told consumers to use
`new URL(input)` or `parseURL(input)` for two years, but there has been no
concrete removal timeline. This document is that timeline.

## Timeline

| Release  | Change                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- |
| v1.7.x   | `$URL` / `createURL` continue to emit `@deprecated`; no runtime warning.                            |
| v1.8.x   | Add a one-time `console.warn` on first `$URL` construction: "$URL is removed in ufo v2. See docs/v2-plan.md." Warning is gated behind a `UFO_SUPPRESS_DEPRECATION_WARNINGS` env var / global. |
| v2.0.0   | **Remove `$URL` class and `createURL()`**. `src/url.ts` is deleted. `export * from "./url"` is removed from `src/index.ts`. Consumers migrate to `parseURL()` + the functional utilities, or to the platform-native `URL`. |

Target v2.0.0 release window: **Q1-2027** (approx. 6 months after v1.8.x lands),
adjustable by maintainers.

## `$URL` → functional API mapping

Every capability on the deprecated `$URL` class has an equivalent in the
functional API. Consumers migrating away should combine `parseURL()` /
`stringifyParsedURL()` for read/write shape access, and the utils functions
for transformations.

| `$URL` member / behaviour                    | Functional replacement                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `new $URL(input)` / `createURL(input)`       | `parseURL(input)` — returns a plain `ParsedURL` object.                                         |
| `.protocol`                                  | `parseURL(input).protocol`, or `getProtocol` / `withProtocol` for read/write.                   |
| `.host`                                      | `parseURL(input).host`.                                                                         |
| `.hostname` (getter)                         | `parseHost(parseURL(input).host).hostname`.                                                     |
| `.port` (getter)                             | `parseHost(parseURL(input).host).port`.                                                         |
| `.auth`                                      | `parseURL(input).auth`.                                                                         |
| `.username` / `.password` (getters)          | `parseAuth(parseURL(input).auth).{username,password}`.                                          |
| `.pathname`                                  | `parseURL(input).pathname`.                                                                     |
| `.query` (object)                            | `getQuery(input)` (read) / `withQuery(input, q)` (write).                                       |
| `.search` (encoded string, getter)           | `parseURL(input).search`, or `stringifyQuery(getQuery(input))`.                                 |
| `.searchParams` (URLSearchParams getter)     | `new URLSearchParams(parseURL(input).search)`, or use platform-native `URL(input).searchParams`. |
| `.hash`                                      | `parseURL(input).hash`, or `withFragment` / `withoutFragment`.                                  |
| `.origin` (getter)                           | Compose from `parseURL(input)`: `protocol + "//" + host`. See platform `URL` for a spec match.  |
| `.fullpath` (getter)                         | `stringifyParsedURL({ ...parseURL(input), protocol: "", host: "", auth: "" })`.                 |
| `.encodedAuth` (getter)                      | `encodeURIComponent(u) + (p ? ":" + encodeURIComponent(p) : "")` derived from `parseAuth`.      |
| `.hasProtocol` (getter)                      | `hasProtocol(input)`.                                                                           |
| `.isAbsolute` (getter)                       | `hasProtocol(input) || parseURL(input).pathname.startsWith("/")`.                               |
| `.href` (getter)                             | `stringifyParsedURL(parseURL(input))`.                                                          |
| `.append(other)` (mutating)                  | Compose: `stringifyParsedURL({ ...parseURL(a), pathname: withTrailingSlash(a.pathname) + withoutLeadingSlash(b.pathname), search: … })`. Prefer `joinURL`, `withQuery`, `withFragment` in the common cases. |
| `.toJSON()` / `.toString()`                  | `stringifyParsedURL(parseURL(input))`.                                                          |

Consumers who need a stateful, mutating URL object should use the platform-native
`new URL(input)` — it is spec-compliant and available in Node 20+, all supported
browsers, and every runtime ufo targets.

## Breaking changes

Every behaviour listed here becomes a breaking change at v2.0.0.

- **`$URL` class removed**. Any `new $URL(x)` or `x instanceof $URL` code fails
  at parse time / runtime.
- **`createURL()` removed**. Any `import { createURL } from "ufo"` fails to
  resolve.
- **`src/url.ts` deleted**. The `./url` subpath is not part of the public
  `package.json` `exports` field, but any consumer using deep imports (e.g.
  `import { $URL } from "ufo/dist/url"`) will break.
- **No behavioural change to `parseURL`, `stringifyParsedURL`, or the utils
  API**. This is a pure removal; the functional API is stable and fully covers
  the removed surface.

## Rationale

- **Two-year drift is long enough**. Consumers who have not migrated yet need a
  concrete sunset date to prioritise the work.
- **The functional API already covers every `$URL` capability** — see the
  mapping table above. No user is stuck.
- **Zero maintenance benefit** from keeping `$URL`: its methods duplicate the
  functional API, and the class is `implements URL` in name only (see the
  incomplete `origin` / `searchParams` semantics vs. WHATWG).
- **Bundle-size win** for downstream consumers: `sap.f`'s bundle already
  tree-shakes `$URL` when unused, but removing the file simplifies the graph
  for build tools that don't do dead-code analysis.

## Non-goals

- We are **not** shipping a v2 immutable-builder API in this plan. That is
  a separate direction plan (D-something) and out of scope here.
- We are **not** changing `parseURL`, `stringifyParsedURL`, or any utility
  function in v2.0.0 as part of this deprecation — this is a subtractive
  release.

## Reviewer's cheat-sheet

If a PR arrives that adds a new getter / setter / method to `$URL`, or that
"fixes" `$URL` behaviour, point the author at this document. `$URL` is
frozen; contributions belong on the functional API or on the future v2
immutable-builder work.
````

#### Step 3.3: Verify the doc

```bash
grep -E "^## Timeline$|^## \\\$URL → functional API mapping$|^## Breaking changes$" docs/v2-plan.md | wc -l
```

**Verify**: output is `3` (all three required headings present, exact spelling).

Also confirm the file lints / renders cleanly:

```bash
pnpm lint
```

**Verify**: exit 0. (Prettier does not check `docs/**` by default in this repo — see
`package.json` `"lint": "eslint . && prettier -c src test"` — but `pnpm lint` still runs and
should stay green.)

#### Step 3.4: Commit and update the plans README

Update `advisor-plans/README.md` — set plan 011's status row to `DONE`. Do not modify any other
row. If plans 005/006/007 have already been marked DONE, no further action; if they are still
TODO, this plan is landing before them (permitted, but note in the row): use
`DONE (landed before 005/006/007; watch for merge-friction if those touch utils/*.ts)`.

Commit:

```bash
git add docs/v2-plan.md advisor-plans/README.md
git commit -m "docs: publish v2 deprecation plan for \$URL class"
```

**Stage 3 is complete.**

## Test plan

- **Stage 1** — No new tests. Behavior-preserving mechanical extraction. Existing ≥509 tests are
  the gate: `pnpm test` must exit 0 after every one of Steps 1.2–1.7 and again at Step 1.8.
- **Stage 2** — Add `test/public-api.test.ts` (Step 2.6). It enumerates every documented public
  export and asserts (a) each is defined on the barrel and (b) the internal `modifyParsedURL`
  helper is NOT exported. Model on the vitest patterns in `test/` (e.g. `test/query.test.ts`).
  Also gate on `dist/index.d.ts` byte-diff against `f06c800` (Step 2.5) and
  `madge --circular src/` (Step 2.7).
- **Stage 3** — Doc-only. Verify presence of the three required section headings via `grep` (Step 3.3).

Full run at the end of each stage:

```bash
pnpm test
```

Expected: exit 0, ≥509 (Stage 1) or ≥509+N (Stage 2) tests pass, no lint failures, no type errors.

## Done criteria

Machine-checkable. ALL must hold at the end of whichever stage(s) you land:

For every landed stage:
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] Working tree contains no unexpected changes: `git status --porcelain` lists only files
      declared in "In scope" for the landed stage(s).
- [ ] The uncommitted `_types.ts` + overloads in-flight work is still present in the working tree
      (or, if it has been committed / merged separately, its effects are still in effect —
      `test/types.test-d.ts` still passes and `src/_types.ts` still exports the same names).

Additionally, per stage:

Stage 1:
- [ ] `git log -1 --pretty=%s` on the branch reads
      `refactor(utils): extract modifyParsedURL helper for parse+mutate+stringify sites`.
- [ ] `grep -n "modifyParsedURL" src/utils.ts` shows exactly 6 matches: the helper definition plus
      the 5 caller sites (`withQuery`, `filterQuery`, `normalizeURL`, `withFragment`, `withoutFragment`).
- [ ] `grep -n "^export" src/utils.ts | grep modifyParsedURL` returns nothing (the helper is NOT
      exported).

Stage 2:
- [ ] `wc -l src/utils.ts` reports well under 30 (barrel only).
- [ ] `pnpm dlx madge --extensions ts,mts,cts --circular src/` reports "No circular dependency found!".
- [ ] `diff` of `dist/index.d.ts` against the baseline built from `f06c800` produces no meaningful
      output (only re-ordering of `export` lines is acceptable).
- [ ] `ls src/utils/` shows the 10 files listed in "In scope" for Stage 2.
- [ ] `grep -n 'from "./utils"' src/parse.ts` returns nothing; `grep -n 'from "./utils/protocol"' src/parse.ts`
      returns one line.
- [ ] `test/public-api.test.ts` exists and its `expected` array covers every public symbol re-exported
      from `src/index.ts` (verified by the `Object.keys` comparison in Step 2.6).

Stage 3:
- [ ] `docs/v2-plan.md` exists.
- [ ] `grep -E "^## Timeline$|^## \\\$URL → functional API mapping$|^## Breaking changes$" docs/v2-plan.md | wc -l`
      is exactly `3`.
- [ ] `src/url.ts` is byte-identical to its state at `f06c800` (verify:
      `git diff f06c800 -- src/url.ts` is empty).
- [ ] `advisor-plans/README.md` plan 011 status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- **Drift**: the code at any of `src/utils.ts:{1, 406-410, 428-436, 677-683, 821-825, 846-848}`,
  `src/parse.ts:2`, `src/url.ts:{12-14, 143-146}`, or `src/index.ts:{1-5}` does not match the
  excerpts in "Current state". This means someone edited these locations after the plan was
  written; the fix must be re-planned, not adapted on the fly.
- **In-flight overloads collision**: at any point during the split (Stage 2), if you notice that a
  refined overload from the uncommitted `_types.ts` work is being dropped or its signature is being
  reduced to a non-refined form (e.g. the `<const S extends string>` generic overload disappears),
  STOP. The split must preserve every overload. If overloads are lost, do not proceed.
- **`dist/index.d.ts` semver break**: Stage 2 Step 2.5's diff shows any added, removed, or renamed
  symbol, any changed function signature, any changed overload count, or any changed order that
  looks non-trivial (e.g. re-parented into a namespace). Even one such change is a semver break —
  this plan is P3 optional and MUST NOT ship a break.
- **Cycle not gone**: after Stage 2 Step 2.4 (breaking the `parse.ts → ./utils/protocol` edge),
  `madge --circular` still reports any cycle in `src/`. Fix imports (do not touch semantics)
  before proceeding; if you cannot get to zero cycles without touching semantics, STOP.
- **Test regression at any stage boundary**: `pnpm test` fails at the end of Stage 1 (Step 1.8),
  Stage 2 (Step 2.7), or Stage 3 (Step 3.3). Revert that stage's commit
  (`git reset --hard HEAD~1`) and report which stage failed and the first failing test.
- **You believe Option B is right for `$URL`**: if, while writing `docs/v2-plan.md`, you decide
  that undeprecating and rewriting `$URL` as an immutable builder is the correct call, STOP and
  escalate. Option A (this plan) commits to removal; the decision to switch strategies is not
  yours to make.
- **A stage's changes require touching a file listed in "Out of scope"**: e.g. Stage 2 would need
  to edit `src/url.ts` to preserve some import, or Stage 1 requires touching `test/types.test-d.ts`.
  STOP — the plan's boundaries are wrong; report the specific out-of-scope file needed and why.
- **Any verification command fails twice after a reasonable fix attempt.**

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **After Stage 2**, contributors adding a new utility function should place it in the correct
  `src/utils/<group>.ts` file, not append to a monolith. `src/utils.ts` is now a barrel; the
  barrel comment (Step 2.5) says exactly this.
- **After Stage 2**, the `parse.ts → utils/protocol` import edge is load-bearing for the acyclic
  graph. If a future PR reintroduces `import … from "./utils"` in `src/parse.ts`, that PR will
  re-introduce the cycle. Reviewers should watch for it. Consider adding
  `pnpm dlx madge --circular src/` to CI in a follow-up plan.
- **After Stage 3**, when a PR arrives adding new features to `$URL`, point the author at
  `docs/v2-plan.md`. The class is frozen; new work belongs on the functional API.
- **Interaction with plan 010 (PERF-04)**: plan 010 adds fast-paths that skip `parseURL` for
  `withFragment` / `withoutFragment` / etc. If plan 010 lands **after** this plan, plan 010's fast
  paths will bypass `modifyParsedURL` — that is fine; `modifyParsedURL` remains the fallback for
  the slow path. If plan 010 lands **before** this plan, some of the 5 Stage 1 call sites may
  already have fast-path guards; still extract, still keep the guards outside `modifyParsedURL`.
- **Interaction with direction plan D1/D2 (`_types.ts` restructuring)**: this plan does not touch
  `_types.ts` and its Stage 2 split moves each symbol together with its refined overloads. D1/D2
  can land before or after this plan without conflict, provided each moved symbol retains its
  `<const S extends string>` overload signatures in the per-group file.
- **Follow-ups explicitly deferred out of this plan**:
  - Adding `madge --circular` to CI (worth doing, but a separate plan).
  - Adding `console.warn` runtime deprecation for `$URL` in v1.8 (specified in `docs/v2-plan.md`
    but not implemented here).
  - Actually deleting `src/url.ts` in v2 (specified in `docs/v2-plan.md` but not implemented here).
  - Splitting `_types.ts` (rejected in the audit as premature; may be reassessed).
