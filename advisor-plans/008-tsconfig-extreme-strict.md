# Plan 008: Rewrite `tsconfig.json` to the extreme-strict, non-defaults-only shape and drive the fallout to zero

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md` if that file exists; if it does not, skip — the advisor
> maintains the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat f06c800..HEAD -- tsconfig.json package.json src/ test/
> ```
>
> If any in-scope file has changed *substantively* since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a mismatch, treat it
> as a STOP condition. (An unchanged `tsconfig.json` at `f06c800`, with only whitespace/trailing-
> comma drift in the working tree, is fine — see Stage 0.)

## Status

- **Priority**: P1 (biggest single-PR type-safety win)
- **Effort**: M — the config change is one commit but the fallout fixes span 6 stages
- **Risk**: MED — `noUncheckedIndexedAccess` will surface real bugs; the fixes must be minimal &
  defensive. The SEMANTIC fixes belong in plans 005–007.
- **Depends on**: `advisor-plans/001-verification-baseline.md` (verification baseline). Runs in
  parallel with 005, 006, 007.
- **Category**: dx
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

`unjs/ufo@1.6.4` currently ships with a three-line `tsconfig.json` (target/module/
esModuleInterop). TypeScript 6.0.3 — pinned by `devDependencies.typescript: "^6.0.3"` in
`package.json` — has since made `strict: true`, `forceConsistentCasingInFileNames: true`, and a
modern `target` equivalent to `ESNext` the **defaults**. That means the current config both
under-uses and mis-documents the compiler.

This plan replaces `tsconfig.json` with a *non-defaults-only* strict configuration: it sets
`module: "preserve"` (which implies bundler-mode resolution, `esModuleInterop`,
`resolveJsonModule`, and `allowSyntheticDefaultImports`), strips the DOM lib (ufo must be
universal), forces `types: []` to keep `@types/node` from leaking into `dist/index.d.ts`, and
turns on the six "extreme-strict" flags that catch real bugs: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`noUnusedLocals`, `noUnusedParameters`, and the erasability trio `isolatedModules` /
`verbatimModuleSyntax` / `erasableSyntaxOnly`.

The payoff: `dist/index.d.ts` becomes DOM-free and node-types-free, unused code is deleted, and
several long-hidden index-access bugs in `src/parse.ts` / `src/utils.ts` are surfaced at compile
time. The bugs themselves are owned by plans 005–007 — this plan applies *defensive* fallout
fixes only, and hands off any real semantic changes to those plans.

Philosophy — **DO NOT SET DEFAULT OPTIONS**. The resulting `tsconfig.json` documents only
non-defaults, which makes it self-descriptive at each TypeScript major bump: re-verify the
default set and prune newly-defaulted flags.

## Current state

### Files in scope (and their role)

- `tsconfig.json` — the file this plan rewrites. Currently 8 lines (see excerpt below).
- `package.json` — will gain one line: `"typecheck": "tsc --noEmit"` in the `scripts` block.
- `src/**/*.ts` — fallout fixes only, defensive and minimal. Semantic bugs go to plans 005–007.

### Current `tsconfig.json` at `f06c800`

Full file content (canonical starting point — 8 lines):

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "esModuleInterop": true
  },
  "include": [
    "src"
  ]
}
```

The working tree at plan-time may show a trivial trailing-comma drift (`"esModuleInterop": true,`)
but is otherwise identical. Do not fight over that — Stage 1 overwrites the whole file.

**If the working tree contains an explicit `"strict": true` line — remove it as part of Stage 1.**
`strict: true` is DEFAULT in TS 6.0.3 (see empirical verification below); leaving it in violates
this plan's philosophy.

### Target `tsconfig.json` — non-defaults only (desired end state)

This is the file you will land at the end of Stage 5. Do not paste this in on Stage 1 — the plan
adds flags in five stages, one commit per stage, so bisection stays useful.

```jsonc
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    // --- Module system ---
    "module": "preserve", // implies moduleResolution:bundler, esModuleInterop, resolveJsonModule, allowSyntheticDefaultImports
    "moduleDetection": "force", // default "auto"
    "lib": ["ESNext"], // default includes DOM — strip it (ufo must not depend on DOM)
    "types": [], // default includes all @types/* — prevent @types/node leakage into d.ts
    "noEmit": true, // unbuild owns emission

    // --- Isolation / erasure ---
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    // --- Extra strict (strict:true is already default in TS 6.0) ---
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,

    // --- DX ---
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Explicitly REJECTED** (never set): `noPropertyAccessFromIndexSignature`. Rationale: ufo's public
`ParsedQuery = Record<string, QueryValue | QueryValue[]>` return type would force consumers into
bracket-only access, hostile to the ergonomic use case `parseQuery(str).foo`. Do not add this
flag under any circumstance in this plan.

### Empirically verified TS 6.0.3 defaults — do NOT re-set these

These were verified with a scratch tsconfig at plan-time. You MAY re-verify with an empty
tsconfig on your end if in doubt. **Never put them into the config file** — they add noise:

- `strict: true` — DEFAULT (empty tsconfig catches `noImplicitAny`, `strictNullChecks`,
  `useUnknownInCatchVariables`).
- `target: "ESNext"`-equivalent — DEFAULT (empty tsconfig accepts `Object.groupBy` /
  `Array.findLast` / private fields).
- `forceConsistentCasingInFileNames: true` — DEFAULT since TS 5.0.
- With `module: "preserve"`, these become implicit defaults:
  - `moduleResolution: "bundler"`
  - `esModuleInterop: true`
  - `resolveJsonModule: true`
  - `allowSyntheticDefaultImports: true`

### `package.json` scripts block at `f06c800` (lines 23–33)

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

**Note**: The working tree may already have a `typecheck` script line added by plan 001
(`"typecheck": "vitest run --typecheck"`). This plan uses `tsc --noEmit` semantics instead —
Stage 6 documents how to reconcile.

TypeScript version (verified): `devDependencies.typescript: "^6.0.3"` — TS 6.0.3 or newer. Do
not add or upgrade TypeScript in this plan.

### Index-access sites likely to surface `noUncheckedIndexedAccess` errors

Sampled at plan-time from `grep -nE '\.match\(|\[[0-9]+\]|_?input\[|segments\[|matches\['`:

| File           | Line | Site (approx)                                                            | Notes                                                                        |
| -------------- | ---: | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/parse.ts` |   85 | `.match(/^[\s\0]*([\w+.-]{2,}:)?\/\/([^/@]+@)?(.*)/) \|\| []`             | Destructured `[, protocol, auth, hostAndPath]` — overlaps SEC-01 (plan 002)  |
| `src/parse.ts` |   88 | `hostAndPath.match(/([^#/?]*)(.*)?/) \|\| []`                            | Destructured `[, host, path]` — likely OK with `= ""` defaults               |
| `src/parse.ts` |  128 | `input.match(/([^#?]*)(\?[^#]*)?(#.*)?/) \|\| []`                        | Multi-group match destructure                                                |
| `src/parse.ts` |  172 | `(input.match(/([^/:]*):?(\d+)?/) \|\| []).splice(1)`                    | `parseHost` IPv6 site — SEMANTIC bug owned by plan 005 (CORR-01)             |
| `src/parse.ts` |  253 | `return matches ? matches[1] : undefined;`                               | Straightforward — `matches[1]` is `string \| undefined` under the flag       |
| `src/utils.ts` |  349 | `const nextChar = input[_base.length];`                                  | `withBase` — SEMANTIC context overlaps plan 006 (CORR-02)                    |
| `src/utils.ts` |  380 | `const nextChar = input[_base.length];`                                  | `withoutBase` — SEMANTIC context overlaps plan 006 (CORR-04)                 |
| `src/utils.ts` |  538 | `segments.length === 1 && hasProtocol(segments[0])`                      | `hasProtocol(segments[0])` — `segments[0]` becomes `string \| undefined`     |
| `src/utils.ts` |  546 | `segments[segments.length - 1]?.endsWith(":/")`                          | Already uses `?.` — likely fine                                              |
| `src/utils.ts` |  547 | `segments[segments.length - 1] += "/" + s;`                              | Compound assignment on possibly-undefined index — needs a guard              |
| `src/utils.ts` |  559 | `input[0]?.startsWith("/") && !url.startsWith("/")`                      | Already uses `?.` — fine                                                     |
| `src/utils.ts` |  561 | `input[0]?.startsWith("./") && !url.startsWith("./")`                    | Already uses `?.` — fine                                                     |
| `src/utils.ts` |  571 | `input[input.length - 1]?.endsWith("/") && !url.endsWith("/")`           | Already uses `?.` — fine                                                     |
| `src/utils.ts` |  655 | `return protocol + input.slice(match[0].length);`                        | `match[0]` — guarded by an `if (!match)` above; may still need refactor      |
| `src/query.ts` |   54 | `parametersString[0] === "?"`                                            | Comparison of `string \| undefined` to `"?"` — trivially safe                |
| `src/query.ts` |   58 | `parameter.match(/([^=]+)=?(.*)/) \|\| []`                               | `s[1]` and `s[2]` become possibly-undefined                                  |
| `src/query.ts` |   62 | `const key = decodeQueryKey(s[1]);`                                      | `s[1]: string \| undefined` — needs `?? ""` or a guard                       |
| `src/query.ts` |   66 | `const value = decodeQueryValue(s[2] \|\| "");`                          | Already defended with `\|\| ""`                                              |
| `src/url.ts`   |   61 | `this.pathname[0] === "/"`                                               | Comparison with `"/"` — safe                                                 |
| `src/punycode.ts` | 30 | `e.length > 1 && ((r = e[0] + "@"), (n = e[1]))`                        | Length-guarded — vendored code, prefer minimal fixes                         |

Total flagged sites: ~20. Expect roughly 20–40 compiler errors under `noUncheckedIndexedAccess`.
If Stage 4 produces >60 errors, STOP (see STOP conditions).

### In-flight work you MUST NOT disturb

At the "Planned at" SHA `f06c800`, the working tree has uncommitted D1 in-flight work:

- `src/_types.ts` — new untracked file (~13.8 KB, ~445 lines).
- Modified: `src/index.ts`, `src/parse.ts`, `src/query.ts`, `src/utils.ts`.
- Modified: `test/types.test-d.ts`, `tsconfig.json`, `package.json`.

`git status --short` at plan-time is:

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

**Do not commit the in-flight work as part of this plan.** It lands independently as v1.7 (plan
D1). If `src/_types.ts` is missing at your Stage 0, see STOP conditions.

If the D1 work has already been committed and merged before you run this plan, that is fine —
proceed identically. The tsconfig changes are orthogonal to the type engine work.

### Repo conventions

- **Package manager**: pnpm pinned via `packageManager: "pnpm@10.33.2"`. Do not use npm/yarn.
- **Build**: `unbuild` owns emission. This plan's `noEmit: true` means `tsc` never emits — that's
  by design; `unbuild` reads `tsconfig.json` for its own purposes but does not require emission.
- **Test**: `pnpm test` runs `eslint . && prettier -c src test && vitest run --typecheck`.
  Plan 001 (which you depend on) may have already added `--typecheck --coverage` to CI.
- **Commit style**: conventional commits. Examples from `git log --oneline -20`:
  - `fix(utils): withBase should keep hash and search #313`
  - `chore(release): v1.6.4`
  - Use `chore(tsconfig): ...`, `refactor(parse): ...`, `chore(ci): ...` for this plan.
- **Branch**: `advisor/008-tsconfig-extreme-strict`.
- **Non-null assertions**: rare in ufo's `src/`. Every `!` you introduce must have a `// safe: <reason>` comment.
- **FIXME markers**: plan 001 installs `FIXME(CORR-NN)` markers in the tests to lock the buggy
  behaviors. If your `noUncheckedIndexedAccess` fix accidentally *fixes* a semantic bug tracked by
  plans 005/006/007, that will show as a FIXME-guarded test flipping green — STOP and hand off
  (see STOP conditions).

## Commands you will need

| Purpose                        | Command                                                        | Expected on success                                              |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Install                        | `pnpm install`                                                 | exit 0                                                           |
| Full test (lint + typecheck)   | `pnpm test 2>&1 \| tail -5`                                    | `Test Files N passed`, `Tests M passed`, exit 0                  |
| Runtime tests only             | `pnpm vitest run 2>&1 \| tail -5`                              | exit 0                                                           |
| Type-only check                | `pnpm exec tsc --noEmit 2>&1 \| tail -20`                      | exit 0 after Stages 1–5; error list before                       |
| Post-Stage-6 typecheck script  | `pnpm typecheck 2>&1 \| tail -5`                               | exit 0                                                           |
| Build                          | `pnpm build 2>&1 \| tail -5`                                   | exit 0                                                           |
| Lint                           | `pnpm lint`                                                    | exit 0                                                           |
| Per-stage diff summary         | `git diff --stat tsconfig.json src/ test/ package.json`        | small diff, in-scope files only                                  |
| TS version check               | `pnpm exec tsc --version`                                      | `Version 6.0.3` or newer                                         |
| Count non-null assertions      | `grep -rn '!' src/*.ts \| grep -vE '(^\s*//\|\* )' \| wc -l`   | count post-Stage-4 must not exceed baseline+5                    |
| Empirical default probe        | `mkdir -p /tmp/tsprobe && echo '{}' > /tmp/tsprobe/tsconfig.json && echo 'const x: string = 1' > /tmp/tsprobe/a.ts && (cd /tmp/tsprobe && pnpm exec --package=typescript@6 tsc --noEmit)` | prints a `strict`-implied error, confirming `strict:true` is default |

## Suggested executor toolkit

- Skill `typescript-strict-migrator` (if available) for staged strict adoption patterns.
- Skill `vitest` (if available) for typecheck-mode invocation.
- The TS 6.0.3 release notes and the `--showConfig` command: `pnpm exec tsc --showConfig` shows
  the resolved (defaults-merged) config. Useful when Stage 2 doesn't behave as expected.

## Scope

**In scope** (the only files you may modify):

- `tsconfig.json` — the primary rewrite target.
- `package.json` — Stage 6 adds one `typecheck` script line.
- `src/**/*.ts` — fallout fixes only, defensive and minimal. Prefer `?? ""` fallbacks, explicit
  `if (!x) return;` guards, or `?.` chains over `!` non-null assertions.

**Out of scope** (do NOT touch even if it seems related):

- `test/**` — no test edits in this plan. If a test starts failing, that's a Stage regression;
  STOP.
- `test/types.test-d.ts` — owned by plan 010 (D1 in-flight finalize).
- `src/_types.ts` (untracked new file) — same, owned by plan 010. Fallout fixes there ARE allowed
  under Stage 5 if `exactOptionalPropertyTypes` surfaces issues, but do NOT restructure the file.
- `.github/workflows/ci.yml` — plan 001 owns CI wiring.
- `dist/**` — build output, not source. Never commit.
- `unbuild` configuration (`build.config.ts` if present) — this plan does not change emission
  behavior.
- `README.md`, `CHANGELOG.md`, `.eslintrc*`, `.prettierrc*` — irrelevant.
- Any semantic bug fix in `src/parse.ts` / `src/utils.ts` around IPv6 hosts, fragment handling in
  `withBase`/`withoutBase`, or `parseAuth` multi-colon handling. Those belong to plans 005/006/007.

## Git workflow

- Branch: `advisor/008-tsconfig-extreme-strict` (create with
  `git switch -c advisor/008-tsconfig-extreme-strict` off the current HEAD; the in-flight D1 work
  stays as uncommitted changes on the branch, unchanged).
- **One commit per stage** (Stages 1–6). Bisection needs the granularity — do not squash.
- Suggested commit messages (conventional commits, matching `git log` style):
  1. `chore(tsconfig): stage 1 — enable free strict flags (noEmit, isolatedModules, lib, types)`
  2. `chore(tsconfig): stage 2 — switch module to "preserve"`
  3. `chore(tsconfig): stage 3 — enable low-fallout strict flags (noUnusedLocals, noImplicitReturns, …)`
  4. `refactor: stage 4 — defensive fixes for noUncheckedIndexedAccess`
  5. `refactor: stage 5 — defensive fixes for exactOptionalPropertyTypes`
  6. `chore(package): stage 6 — add tsc --noEmit typecheck script`
- Do NOT push. Do NOT open a PR. Do NOT run `pnpm release`.

## Steps

### Stage 0: Confirm baseline is green

```bash
cd /Users/i584843/SAPDevelop/dev/ufo
git rev-parse --short HEAD
git status --short
pnpm install
pnpm exec tsc --version
pnpm test 2>&1 | tail -5
pnpm build 2>&1 | tail -5
```

**Verify**:

- `git rev-parse --short HEAD` → `f06c800` (or newer, if the D1 in-flight work has been committed
  — that's fine).
- `git status --short` shows the D1 in-flight modifications (see "In-flight work you MUST NOT
  disturb"). Both are acceptable:
  - **Case A** (uncommitted, plan-time): `?? src/_types.ts` present, plus `M` for the other in-flight files.
  - **Case B** (already merged): no `M` / `??` for the in-flight files.
- `pnpm exec tsc --version` → `Version 6.0.3` or newer. If lower, STOP.
- `pnpm test` → exits 0, `Tests M passed` with M ≥ 509 runtime + 18 type = 527. If red, STOP.
- `pnpm build` → exits 0. This is your build-shape baseline for Stage 2.

Now capture the `dist/` size for Stage 2's comparison:

```bash
du -b dist/*.mjs dist/*.cjs dist/*.d.ts 2>/dev/null | tee /tmp/ufo-dist-baseline.txt
```

Expected: a line per artifact with byte size. If `dist/` is missing (fresh clone, no build), run
`pnpm build` first.

Also capture baseline non-null-assertion count for Stage 4's red-flag check:

```bash
grep -c '!' src/*.ts | tee /tmp/ufo-bang-baseline.txt
```

Expected: a file:count table. Sum the counts and remember the total.

Create the working branch:

```bash
git switch -c advisor/008-tsconfig-extreme-strict
```

Expected: `Switched to a new branch 'advisor/008-tsconfig-extreme-strict'`. In-flight modifications
travel with the branch.

### Stage 1: Free flags (zero-fallout expected)

Overwrite `tsconfig.json` with the following exact contents. This adds all the flags that should
introduce zero type errors on a healthy codebase.

```jsonc
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    // --- Module system (still ESNext at this stage; module:"preserve" comes in Stage 2) ---
    "target": "ESNext",
    "module": "ESNext",
    "esModuleInterop": true,
    "moduleDetection": "force",
    "lib": ["ESNext"],
    "types": [],
    "noEmit": true,

    // --- Isolation / erasure ---
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    // --- DX ---
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Rationale for the shape:

- `target`/`module` are kept as `ESNext` at this stage (redundant vs. defaults, but keeps the
  Stage 1 diff smaller and doesn't couple free flags to the module-system switch). Stage 2 removes
  `target`/`module: "ESNext"` and swaps `module` to `"preserve"`.
- `esModuleInterop: true` is kept explicit at this stage. Stage 2 drops it because `module:
  "preserve"` implies it.
- If the working tree had an explicit `"strict": true` line, it is now removed (it's default).
- `types: []` prevents `@types/node` (declared in `devDependencies`) from leaking into `dist/*.d.ts`.

**Verify**:

```bash
pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: **zero errors, exit 0**. If any error appears, STOP (see STOP conditions — Stage 1
should be free).

```bash
pnpm test 2>&1 | tail -5
```

Expected: exit 0, 509+ runtime + 18 type tests pass.

```bash
pnpm build 2>&1 | tail -5
```

Expected: exit 0. `dist/` regenerated — see Stage 2 for shape comparison.

```bash
git diff --stat tsconfig.json src/ test/ package.json
```

Expected: only `tsconfig.json` in the diff (other than the pre-existing in-flight modifications
of `src/**`, which are unchanged).

Commit:

```bash
git add tsconfig.json
git commit -m 'chore(tsconfig): stage 1 — enable free strict flags (noEmit, isolatedModules, lib, types)'
```

### Stage 2: Module system switch to `"preserve"`

Overwrite `tsconfig.json` again — this time swap `module: "ESNext"` → `module: "preserve"`,
remove the now-redundant `esModuleInterop` line, and drop the now-redundant `target` line
(target defaults to ES2022+ under `module: "preserve"` in TS 6.0, but leaving `target: "ESNext"`
is harmless; the plan removes it to stay non-defaults-only).

```jsonc
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    // --- Module system ---
    "module": "preserve", // implies moduleResolution:bundler, esModuleInterop, resolveJsonModule, allowSyntheticDefaultImports
    "moduleDetection": "force",
    "lib": ["ESNext"],
    "types": [],
    "noEmit": true,

    // --- Isolation / erasure ---
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    // --- DX ---
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`module: "preserve"` implies bundler-mode resolution, `esModuleInterop`, `resolveJsonModule`, and
`allowSyntheticDefaultImports`. Should be a behavioral no-op for ufo (zero deps, ESM+CJS
dual-shipped by unbuild). The risk is any file that relies on legacy `moduleResolution: "node"` —
none expected in ufo, but this is the one Stage where a hidden import quirk could surface.

**Verify**:

```bash
pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors, exit 0.

```bash
pnpm exec tsc --showConfig 2>&1 | grep -E '"moduleResolution"|"esModuleInterop"|"resolveJsonModule"|"allowSyntheticDefaultImports"'
```

Expected: shows `"moduleResolution": "bundler"`, `"esModuleInterop": true`,
`"resolveJsonModule": true`, `"allowSyntheticDefaultImports": true` — confirming the implicit
defaults kicked in.

```bash
pnpm test 2>&1 | tail -5
```

Expected: exit 0, 509+ runtime + 18 type tests pass.

```bash
pnpm build 2>&1 | tail -5
```

Expected: exit 0.

```bash
du -b dist/*.mjs dist/*.cjs dist/*.d.ts 2>/dev/null > /tmp/ufo-dist-stage2.txt
diff /tmp/ufo-dist-baseline.txt /tmp/ufo-dist-stage2.txt
```

Expected: **identical or near-identical** (byte-for-byte on `.mjs`/`.cjs`; `.d.ts` may shrink
slightly because `types: []` strips `@types/node` from the emitted declarations — that is the
desired outcome, not a regression). If the sizes diverge by more than ~5%, investigate the
`.d.ts` diff manually with `git diff --no-index -- /path/to/old/dist/index.d.ts dist/index.d.ts`
and confirm the delta is DOM-lib or node-types stripping, not a new dependency creeping in.

Commit:

```bash
git add tsconfig.json
git commit -m 'chore(tsconfig): stage 2 — switch module to "preserve"'
```

### Stage 3: Low-fallout extra strict

Add the low-fallout strict flags. Expect a small handful of unused-variable and missing-return
errors.

```jsonc
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    // --- Module system ---
    "module": "preserve",
    "moduleDetection": "force",
    "lib": ["ESNext"],
    "types": [],
    "noEmit": true,

    // --- Isolation / erasure ---
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    // --- Extra strict (low fallout) ---
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,

    // --- DX ---
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Run `tsc --noEmit` and fix each error IN PLACE, minimally:

- **Unused local**: delete the declaration, or (if it documents intent) prefix with `_` to
  suppress. Prefer deletion.
- **Unused parameter**: prefix with `_` (e.g. `arg` → `_arg`), or delete if the parameter is
  entirely surplus. Prefer `_` for public function signatures (do not change the arity of any
  exported function).
- **Missing return in a code path**: add an explicit `return undefined;` or `return "";`
  matching the function's return type. Do NOT change the function's signature.
- **Fallthrough case in switch**: add an explicit `break;` or `// falls through` comment. Note:
  the `// falls through` escape hatch is honored by TypeScript.
- **Unreachable code / unused label**: delete.

**Do not restructure functions in this stage.** Every fix should be a single-line edit.

**Verify**:

```bash
pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors.

```bash
pnpm test 2>&1 | tail -5
```

Expected: exit 0, all tests pass. If any test fails, your fix removed real logic — revert and
reconsider.

```bash
git diff --stat tsconfig.json src/ test/ package.json
```

Expected: `tsconfig.json` + a small number of `src/*.ts` files (typically ≤ 3 files, ≤ 20 lines).
No `test/` changes.

Commit:

```bash
git add tsconfig.json src/
git commit -m 'chore(tsconfig): stage 3 — enable low-fallout strict flags (noUnusedLocals, noImplicitReturns, ...)'
```

### Stage 4 — HIGH fallout: `noUncheckedIndexedAccess`

Add the flag. Expect ~20–40 errors, concentrated in `src/parse.ts`, `src/utils.ts`, and
`src/query.ts` — see the index-access site table under "Current state".

```jsonc
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    // --- Module system ---
    "module": "preserve",
    "moduleDetection": "force",
    "lib": ["ESNext"],
    "types": [],
    "noEmit": true,

    // --- Isolation / erasure ---
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    // --- Extra strict ---
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,

    // --- DX ---
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Get the full error list first:

```bash
pnpm exec tsc --noEmit 2>&1 | tee /tmp/ufo-stage4-errors.txt | tail -80
wc -l /tmp/ufo-stage4-errors.txt
```

Count errors. **If the error count exceeds 60, STOP** (see STOP conditions).

For each error, apply ONE of these fix patterns — in priority order. Prefer the earliest pattern
that works.

**Pattern A — `?? ""` / `?? []` fallback (preferred).** For sites where "undefined" is
semantically indistinguishable from "empty" at the immediate usage point:

```ts
// Before:
const s = parameter.match(/([^=]+)=?(.*)/) || [];
const key = decodeQueryKey(s[1]);
// After:
const s = parameter.match(/([^=]+)=?(.*)/) || [];
const key = decodeQueryKey(s[1] ?? "");
```

**Pattern B — destructure with defaults.** Where you already destructure the result of a
`.match()`:

```ts
// Before:
const [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)?/) || [];
// If it's already got defaults like the above, it may already be strict-safe; verify with tsc.
```

The compiler accepts destructuring defaults as long as the source is a tuple of possibly-undefined
elements. Sites at `src/parse.ts:88` are typically already in this shape.

**Pattern C — explicit `if (!x)` guard.** For sites where the code should logically bail on
undefined:

```ts
// Before:
if (!match)
  return input;
return protocol + input.slice(match[0].length);
// After (if match[0] still trips the flag under TS's control-flow analysis):
if (!match)
  return input;
const first = match[0];
if (first === undefined)
  return input; // safe: guarded above, TS lost narrowing
return protocol + input.slice(first.length);
```

Where possible, restructure to store `match[0]` in a local under the `if (match)` narrowing.

**Pattern D — non-null assertion `!` with mandatory comment (last resort).** Use only when
patterns A/B/C are semantically wrong or impossibly awkward. Every `!` MUST have a `// safe: <reason>` comment on the same or the previous line:

```ts
// Before:
const first = match[0];
// After:
const first = match![0]; // safe: guarded by `if (!match) return input;` above
```

The linter/reviewer will grep for orphan `!` in `git diff`. Do not add more than 5 non-null
assertions total across Stage 4.

**IMPORTANT: hand-off rule with plans 005/006/007.** If a `noUncheckedIndexedAccess` error is at
a location that plans 005–007 will change (see the table under "Current state"), your job is a
**minimal defensive fix**, not a semantic fix:

- `src/parse.ts:172` (parseHost IPv6, CORR-01) — DO fix with a defensive fallback (e.g., match
  the tuple pattern already in use, or `port ?? undefined`); do NOT rewrite the regex or reshape
  the return type. The IPv6 fix is plan 005.
- `src/utils.ts:349`, `src/utils.ts:380` (withBase/withoutBase, CORR-02/04) — DO fix `nextChar`
  with `input[_base.length] ?? ""` so the comparison against `"/"` etc. still works with an empty
  string; do NOT touch the surrounding fragment-handling logic. The fragment fix is plan 006.
- `src/parse.ts:172` overlaps `parseAuth` (CORR-03) if you're tempted to co-refactor — DON'T.
  Plan 007 owns it.

If a `noUncheckedIndexedAccess` error at any of these sites CANNOT be fixed defensively without
altering semantics (i.e., the test suite fails once you defensively fix), STOP and hand off to
the relevant correctness plan (see STOP conditions).

**Verify**:

```bash
pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors.

```bash
pnpm test 2>&1 | tail -5
```

Expected: exit 0. **Every one of the 509+ runtime tests still passes.** The characterization
tests installed by plan 001 (with `FIXME(CORR-NN)` markers pinning buggy behaviors) must still
pass unchanged — if one of them turns from red-FIXME to green, you've accidentally fixed a
semantic bug, which is out of scope. STOP.

```bash
NEW_BANG_COUNT=$(grep -c '!' src/*.ts | awk -F: '{sum+=$2} END {print sum}')
OLD_BANG_COUNT=$(awk -F: '{sum+=$2} END {print sum}' /tmp/ufo-bang-baseline.txt)
echo "baseline $OLD_BANG_COUNT, now $NEW_BANG_COUNT, delta $((NEW_BANG_COUNT - OLD_BANG_COUNT))"
```

Expected: delta ≤ 5. **If the delta is > 5, that's a red flag for review** — you've reached for
non-null assertions too eagerly. Revisit each new `!` and see if patterns A/B/C would work
instead. (The `!` char also appears in `!==`, `!=`, unary `!`, etc.; the diff-scoped check below
is more precise.)

```bash
git diff HEAD -- src/ | grep -E '^\+' | grep -vE '^\+\+\+' | grep -cE '[^!=<>]![^=]'
```

A rough "added lines that contain a `!` used as postfix non-null assertion". Expected: ≤ 5.

For every `!` added, confirm a `// safe: <reason>` comment is on the same or prior line:

```bash
git diff HEAD -- src/ | grep -B1 -E '^\+.*[^!=<>]![^=]' | grep -c 'safe:'
```

Expected: **equal to the number of `!` added**. Every non-null assertion must be justified.

Commit:

```bash
git add tsconfig.json src/
git commit -m 'refactor: stage 4 — defensive fixes for noUncheckedIndexedAccess'
```

### Stage 5 — HIGH fallout: `exactOptionalPropertyTypes`

Add the flag. Expect fewer errors than Stage 4 — the D1 in-flight work in `src/_types.ts` was
already authored with strict semantics in mind, but some optional-property sites may still
distinguish `foo?: T` from `foo: T | undefined`.

```jsonc
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    // --- Module system ---
    "module": "preserve",
    "moduleDetection": "force",
    "lib": ["ESNext"],
    "types": [],
    "noEmit": true,

    // --- Isolation / erasure ---
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    // --- Extra strict ---
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,

    // --- DX ---
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

This is now the **target tsconfig** — the desired end state minus the Stage-6 script wiring.
Compare against the "Target tsconfig" excerpt at the top and they should be identical.

Get errors:

```bash
pnpm exec tsc --noEmit 2>&1 | tee /tmp/ufo-stage5-errors.txt | tail -40
```

Fix each error. Typical patterns:

- **Assigning `undefined` to a `T?` field**:
  ```ts
  // Before:
  return { hostname, port: undefined };
  // After — prefer the "T | undefined" declaration on the interface:
  // (change the interface: `port?: string` → `port?: string | undefined`)
  // OR omit the property entirely at the assignment site:
  return { hostname };
  ```
  For ufo, **prefer widening the type to `string | undefined`** (or the relevant `| undefined`)
  in `src/_types.ts` where the property was declared. Do NOT drop the `?` — the `?` still
  encodes "property may be absent", the `| undefined` adds "or explicitly undefined". Both are
  callers-need-to-check.

- **Object spread with a possibly-undefined property**: spreading is always safe; the flag only
  fires on direct assignments. If tsc complains, look for a literal `{ ..., prop: someMaybeUndef }`
  and either extract into a conditional (`...(prop !== undefined && { prop })`) or widen the
  target type.

- **`_types.ts` fallout**: If the flag surfaces issues in the D1 in-flight `src/_types.ts`, **fix
  in place** — do NOT revert the in-flight work. The fix will typically be
  `foo?: T` → `foo?: T | undefined` on interface declarations.

**Verify**:

```bash
pnpm exec tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

```bash
pnpm test 2>&1 | tail -5
```

Expected: exit 0, all 509+ runtime + 18 type tests pass.

```bash
git diff --stat tsconfig.json src/ test/ package.json
```

Expected: `tsconfig.json` + a small number of `src/*.ts` files. `test/` untouched.

Confirm the config now matches the target exactly:

```bash
diff -u <(cat <<'EOF'
{
  "$schema": "https://www.schemastore.org/tsconfig",
  "compilerOptions": {
    "module": "preserve",
    "moduleDetection": "force",
    "lib": ["ESNext"],
    "types": [],
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "noErrorTruncation": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
EOF
) <(pnpm exec tsc --showConfig 2>/dev/null | jq '{compilerOptions, include}' 2>/dev/null || echo "jq not available; skip this comparison")
```

The `tsc --showConfig` output includes defaults, so a direct diff will show many additional
lines — that's fine. Just visually confirm every flag on the target side is present. Do not gate
on this comparison being exact.

Commit:

```bash
git add tsconfig.json src/
git commit -m 'refactor: stage 5 — defensive fixes for exactOptionalPropertyTypes'
```

### Stage 6 — Add `typecheck` script + CI wiring

Add a `typecheck` script to `package.json` that runs `tsc --noEmit`. Note the semantic: plan 001
may already have added `"typecheck": "vitest run --typecheck"` — this plan uses `tsc --noEmit`
for a different, complementary reason.

**Reconciliation rule**: If plan 001 has already added a `typecheck` script:

- If it reads `"typecheck": "vitest run --typecheck"` — **rename it to `test:typecheck`**, and
  add the new `tsc --noEmit` version as `typecheck`. `tsc --noEmit` catches things vitest's
  typecheck mode doesn't (unused locals, `exactOptionalPropertyTypes` on non-test files, etc.).
- If it reads `"typecheck": "tsc --noEmit"` (identical semantics) — leave it. Nothing to do.
- If no `typecheck` script exists — add the new one.

Target `scripts` block shape (after this plan on top of plan 001):

```json
  "scripts": {
    "build": "automd && unbuild",
    "automd": "automd",
    "dev": "vitest",
    "lint": "eslint . && prettier -c src test",
    "lint:fix": "eslint --fix . && prettier -w src test",
    "prepack": "pnpm build",
    "release": "pnpm test && changelogen --release && npm publish && git push --follow-tags",
    "typecheck": "tsc --noEmit",
    "test:typecheck": "vitest run --typecheck",
    "test": "pnpm lint && vitest run --typecheck"
  },
```

If plan 001 has NOT landed yet, just add the `typecheck` line — the `test:typecheck` line is
plan-001-conditional.

Do NOT touch `.github/workflows/ci.yml` — plan 001 owns CI wiring. Any new CI step for
`pnpm typecheck` is a follow-up.

**Verify**:

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: exit 0. `tsc` runs with the extreme-strict config and emits nothing (`noEmit: true`),
but reports type OK.

```bash
grep -c '"typecheck":' package.json
```

Expected: `1` (exactly one).

```bash
grep '"typecheck":' package.json
```

Expected line: `    "typecheck": "tsc --noEmit",` (with trailing comma if there's a following
script).

```bash
git diff --stat package.json
```

Expected: 1 or 2 lines changed (adding `typecheck`, optionally renaming an old `typecheck` to
`test:typecheck`).

Full-plan final sweep:

```bash
pnpm lint
pnpm test 2>&1 | tail -5
pnpm build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -5
git log --oneline advisor/008-tsconfig-extreme-strict ^HEAD~10
```

Expected:

- `pnpm lint` exit 0.
- `pnpm test` exit 0, tests unchanged from Stage 0 count.
- `pnpm build` exit 0. `dist/` shape unchanged from Stage 2 (except the `types: []` `.d.ts`
  shrinkage, which is desired).
- `pnpm typecheck` exit 0.
- `git log --oneline` shows 6 new commits (one per stage), each on branch
  `advisor/008-tsconfig-extreme-strict`.

Commit:

```bash
git add package.json
git commit -m 'chore(package): stage 6 — add tsc --noEmit typecheck script'
```

## Test plan

This plan adds NO new tests. All verification runs against the existing 509+ runtime tests and
18 type-level tests, plus the characterization tests installed by plan 001.

The invariants each stage protects:

- **Every stage**: `pnpm test` exits 0 and reports the SAME test count as Stage 0. If the count
  drops, a test was silently skipped — STOP.
- **Stage 2**: `pnpm build` still produces the expected `dist/` shape. Byte-diff against
  `/tmp/ufo-dist-baseline.txt` should be zero on `.mjs`/`.cjs`; small shrinkage on `.d.ts` is OK.
- **Stage 4**: `FIXME(CORR-NN)` characterization tests installed by plan 001 must remain red-locked
  (i.e., still asserting the buggy value). If one turns green, you accidentally landed a semantic
  fix — hand off to plan 005/006/007.
- **Stage 5**: `test/types.test-d.ts` (18 type-level tests, D1 in-flight) all still pass.

## Done criteria

Machine-checkable. **ALL must hold**:

- [ ] `tsconfig.json` matches the "Target tsconfig — non-defaults only" shape from "Current state"
      exactly (comment placement may differ; flag set must match).
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] `pnpm typecheck` exits 0 (Stage 6).
- [ ] `pnpm test` exits 0. Test count is exactly the Stage 0 baseline (no regressions; no
      accidental additions).
- [ ] `pnpm build` exits 0 and `dist/*.mjs` + `dist/*.cjs` byte sizes match the Stage 0 baseline.
      `dist/*.d.ts` may be SMALLER (no `@types/node` leak, no DOM lib) — that's a WIN, not a
      regression.
- [ ] `pnpm lint` exits 0.
- [ ] `grep -c '"typecheck": "tsc --noEmit"' package.json` → `1`.
- [ ] No file under `test/` appears in `git diff main -- test/` for this branch (test edits are
      out of scope).
- [ ] No `!` non-null assertion in `git diff main -- src/` lacks a nearby `// safe: <reason>`
      comment. Count of new `!` assertions ≤ 5.
- [ ] `git log --oneline advisor/008-tsconfig-extreme-strict ^main` shows exactly 6 commits
      (one per stage). Do not squash before landing.
- [ ] `advisor-plans/README.md` status row for plan 008 updated (unless the advisor maintains it).
- [ ] The `FIXME(CORR-01)`, `FIXME(CORR-02)`, `FIXME(CORR-03)`, `FIXME(CORR-04)` markers installed
      by plan 001 (if plan 001 has landed) are STILL PRESENT and STILL red-locked. Command:
      `grep -rn 'FIXME(CORR-' test/` — count matches Stage 0.

## STOP conditions

Stop and report back (do not improvise) if any of the following occurs:

- **Baseline broken**: `pnpm test` fails at Stage 0 (before any edits). The plan cannot proceed
  from red.
- **TS version too old**: `pnpm exec tsc --version` reports < 6.0.3. This plan's empirical
  default-set assumes 6.0.3+.
- **Free flags aren't free**: Stage 1 produces ANY type error. Free flags (`noEmit`,
  `moduleDetection`, `lib`, `types`, `isolatedModules`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, `noErrorTruncation`, `skipLibCheck`) should produce zero errors on a
  healthy codebase. If they don't, something structural is off — investigate before continuing.
- **Module switch breaks resolution**: Stage 2 produces a "cannot find module" error, or the
  `dist/` `.mjs`/`.cjs` sizes diverge by >5%. Investigate whether a source import was relying on
  legacy `moduleResolution: "node"` semantics.
- **`noUncheckedIndexedAccess` fallout too large**: Stage 4 error count > 60. The fallout is
  bigger than expected — pause and dispatch its own sub-plan.
- **Semantic-fix required**: A `noUncheckedIndexedAccess` error in Stage 4 cannot be fixed with
  patterns A/B/C/D (i.e., a defensive fix breaks the test suite). Stop and hand off to the
  relevant correctness plan (005 for IPv6, 006 for base/fragment, 007 for parseAuth). Continue
  Stage 4 with just the *other* defensive fixes; do NOT land the semantic fix under this plan.
- **Characterization test flips**: A `FIXME(CORR-NN)` test from plan 001 turns green during
  Stage 4. That means your "defensive" fix accidentally landed a semantic fix. Revert that
  specific fix, hand off to the relevant plan, and continue.
- **`_types.ts` missing**: If `src/_types.ts` was uncommitted at plan-time and is now MISSING
  from your working tree — verify with `git log --all -- src/_types.ts`. If the file has never
  been committed and does not exist, STOP; the D1 in-flight work was lost and needs to be
  recovered before Stage 5 runs correctly.
- **Non-null-assertion budget blown**: Stage 4 introduces > 5 new `!` non-null assertions (see
  the diff-scoped grep in Stage 4's Verify). Review each; either patterns A/B/C would work, or
  the fallout warrants a bigger discussion.
- **Missing `// safe:` justification**: Any `!` non-null assertion added in Stage 4 lacks a
  nearby `// safe: <reason>` comment. Every one must be justified.
- **`strict: true` reappears**: If, at any point, an explicit `"strict": true` line appears in
  `tsconfig.json` — remove it. It's the DEFAULT in TS 6.0.3 and violates this plan's philosophy.
- **`noPropertyAccessFromIndexSignature` reappears**: If this flag ever gets added by mistake,
  remove it. It is explicitly rejected — see rationale in "Target tsconfig".

## Maintenance notes

For whoever owns this configuration after this plan lands:

- **The tsconfig now documents non-defaults only.** At each TypeScript major bump (5→6, 6→7, …),
  re-run the empirical default-verification (see the `mkdir -p /tmp/tsprobe …` command in
  "Commands you will need") with the new TS version, and prune any flag that has become default.
  Suggested review cadence: at every TS major bump.
- **Do NOT add `noPropertyAccessFromIndexSignature`.** ufo's public `ParsedQuery = Record<string,
  QueryValue | QueryValue[]>` return would force consumers into `qs["foo"]` bracket-only access,
  breaking the ergonomic `parseQuery(str).foo` idiom. Explicitly rejected.
- **`module: "preserve"` implies bundler-mode resolution.** If a future contributor wants to run
  `tsc` as an actual emitter (unlikely — unbuild owns that), they'll need to override
  `moduleResolution`. Note this in the PR that considers switching.
- **`noEmit: true` means `tsc` NEVER emits.** `unbuild` owns emission and reads this tsconfig
  for type info only. If a future refactor wants `tsc` to emit `.d.ts` (e.g., dropping unbuild),
  the `noEmit` flag must go — but then `types: []` also has to be reconsidered because
  `@types/node` types may need to reach the emitted `.d.ts`. Both flags are tightly coupled to
  the "unbuild owns emission" invariant.
- **Non-null assertions**: any `!` in `src/**/*.ts` must carry a `// safe: <reason>` comment.
  Reviewers should grep-block otherwise.
- **`_types.ts` interactions**: the D1 in-flight `src/_types.ts` was authored with `strict: true`
  semantics in mind. Future edits to that file must remain compatible with
  `exactOptionalPropertyTypes` — prefer `foo?: T | undefined` over `foo?: T` when the property is
  ever assigned an explicit `undefined` at any call site.
- **Reviewer focus for the resulting PR** (6 commits, one per stage):
  1. Confirm each stage is its own commit and bisection-clean.
  2. Confirm no `test/` edits.
  3. Grep `!` in the diff; every one has a `// safe: <reason>` on the same or previous line.
  4. Grep `FIXME(CORR-` in `test/`; count matches pre-plan baseline (no accidental unlocks).
  5. Confirm `dist/*.mjs`/`.cjs` byte-identical to baseline; `.d.ts` may shrink.
  6. Confirm `tsconfig.json` matches the target-shape excerpt from the plan verbatim (modulo
     comments/whitespace).
- **Follow-ups explicitly deferred** (do NOT do these under this plan):
  - `attw` / `publint` type-shipping checks — separate DX plan.
  - Adding new eslint rules that duplicate strict-flag catches — separate DX plan.
  - Node version matrix in CI — plan 001 territory.
  - Any semantic fix in `src/parse.ts` / `src/utils.ts` — plans 005/006/007.
