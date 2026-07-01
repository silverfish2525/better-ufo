# Plan 012: Deps, CI, and DX hygiene — audit consolidation

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f06c800..HEAD -- package.json .github/workflows/ci.yml renovate.json`
> If any of those files changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.
>
> **Do NOT touch `src/**`, `test/**`, or the uncommitted in-flight `src/_types.ts` work.** This plan
> is 100% config/tooling/docs. Every stage is an independent commit; if a stage's STOP fires, land
> the earlier stages and report.

## Status

- **Priority**: P2
- **Effort**: M (6 × S sub-stages)
- **Risk**: LOW (all changes are config/tooling; each stage is independently revertable)
- **Depends on**: `001-verification-baseline.md` (verification baseline — CI needs `--typecheck` and
  characterization tests before we lean harder on it)
- **Category**: deps + dx
- **Planned at**: commit `f06c800`, 2026-07-01

## Why this matters

Six low-effort hygiene findings from the deep audit — one HIGH-severity dev-side CVE, single-Node CI
for a universal library, a `build` script that dirties `README.md`, no guard on the zero-runtime-deps
invariant that is `ufo`'s #1 design property, no Renovate pin for the experimental `--typecheck`
tool, no `attw`/`publint` gates on a package that publishes ESM+CJS+`.d.ts`, and no contributor doc
at all. Each is trivial in isolation, but together they raise the noise floor on every future PR
and audit. Landing them as one plan (six stages, six commits) removes that noise for good.

## Current state

- `/Users/i584843/SAPDevelop/dev/ufo/package.json` — scripts + devDeps + `exports` map. Runtime
  `"dependencies": {}` is empty (line 22). Baseline excerpt (verbatim at `f06c800`):

  ```json
  {
    "name": "ufo",
    "version": "1.6.4",
    ...
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.mjs",
        "require": "./dist/index.cjs",
        "default": "./dist/index.mjs"
      },
      "./*": "./*"
    },
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.ts",
    "files": ["dist"],
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
    "devDependencies": {
      "@types/node": "^25.6.0",
      "@vitest/coverage-v8": "^4.1.5",
      "automd": "^0.4.3",
      "changelogen": "^0.6.2",
      "eslint": "^10.2.1",
      "eslint-config-unjs": "^0.6.2",
      "jiti": "^2.6.1",
      "prettier": "^3.8.3",
      "typescript": "^6.0.3",
      "unbuild": "^3.6.1",
      "untyped": "^2.0.0",
      "vitest": "^4.1.5"
    },
    "packageManager": "pnpm@10.33.2"
  }
  ```

- `/Users/i584843/SAPDevelop/dev/ufo/.github/workflows/ci.yml` — single-Node CI (verbatim at
  `f06c800`):

  ```yaml
  name: ci

  on:
    push:
      branches:
        - main
    pull_request:
      branches:
        - main

  jobs:
    ci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v6
        - run: npm i -fg corepack && corepack enable
        - uses: actions/setup-node@v6
          with:
            node-version: 20
            cache: pnpm
        - run: pnpm install
        - run: pnpm lint
        - run: pnpm build
        - run: pnpm vitest --coverage
        - uses: codecov/codecov-action@v6
  ```

- `/Users/i584843/SAPDevelop/dev/ufo/.github/workflows/autofix.yml` — separate autofix workflow.
  **Do not modify in this plan** — read-only reference so you don't duplicate its behavior:

  ```yaml
  name: autofix.ci
  on:
    pull_request:
    push:
      branches: [main]
  permissions:
    contents: read
  jobs:
    autofix:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v6
        - run: npm i -fg corepack && corepack enable
        - uses: actions/setup-node@v6
          with:
            node-version: 20
            cache: pnpm
        - run: pnpm install
        - run: pnpm automd
        - run: pnpm lint:fix
        - uses: autofix-ci/action@7a166d7532b277f34e16238930461bf77f9d7ed8
          with:
            commit-message: "chore: apply automated updates"
  ```

- `/Users/i584843/SAPDevelop/dev/ufo/renovate.json` — verbatim at `f06c800`:

  ```json
  {
    "extends": ["github>unjs/renovate-config"]
  }
  ```

- `/Users/i584843/SAPDevelop/dev/ufo/pnpm-lock.yaml` — exists; regenerated by `pnpm install`.
- `/Users/i584843/SAPDevelop/dev/ufo/AGENTS.md` — does **not** exist at `f06c800`.
- `/Users/i584843/SAPDevelop/dev/ufo/CONTRIBUTING.md` — does **not** exist at `f06c800`.
- `/Users/i584843/SAPDevelop/dev/ufo/scripts/` — directory does **not** exist at `f06c800`
  (create it in Stage 4).

**Repo conventions the plan honors**:

- **Zero runtime deps** — `"dependencies": {}`. This is a design property, not incidental. Stage 4
  codifies it.
- **Conventional commits** — one commit per stage, prefix as noted per stage.
- **Package manager**: `pnpm@10.33.2` (pinned in `packageManager`). Always use `pnpm`, never `npm`
  or `yarn`, for install/scripts.
- **`automd` rewrites `README.md`** — expected by design when signature docs change, surprising on
  every local build (Stage 3 fixes this).
- **Uncommitted in-flight work**: `src/_types.ts`, refined overloads in `src/{index,parse,query,utils}.ts`,
  `test/types.test-d.ts`, and 509 green tests. **Do not commit this in-flight work; do not disturb
  it.** Every `git commit` in this plan must stage only the files listed in "Scope" — use
  `git add <explicit path>` per stage, never `git add -A`.

## Commands you will need

| Purpose                    | Command                                                             | Expected on success                     |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Install                    | `pnpm install`                                                      | exit 0                                  |
| Test (lint + vitest)       | `pnpm test`                                                         | exit 0, 509 tests pass                  |
| Build                      | `pnpm build`                                                        | exit 0, `dist/` populated               |
| Lint only                  | `pnpm lint`                                                         | exit 0                                  |
| Audit (HIGH+ only)         | `pnpm audit --audit-level=high`                                     | exit 0 after Stage 1                    |
| Renovate config validate   | `npx --package renovate -- renovate-config-validator renovate.json` | exit 0, "SUCCESS"                       |
| Package sanity             | `pnpm test:package` (after Stage 5)                                 | exit 0                                  |
| Show current branch        | `git rev-parse --abbrev-ref HEAD`                                   | `advisor/012-deps-ci-dx-hygiene`        |
| Staged status              | `git status --short`                                                | only in-scope files listed              |

## Git workflow

- Branch: `advisor/012-deps-ci-dx-hygiene`. Create it from `f06c800` if not already on it:
  `git checkout -b advisor/012-deps-ci-dx-hygiene f06c800` (only if the current branch is different
  AND the working tree is clean of the in-flight `_types.ts` work — if the in-flight work is present
  in the working tree, do NOT change branches; check out on top of it and preserve it).
- **One commit per stage.** Six stages → six commits. Do not squash.
- Commit message style: conventional commits. Suggested prefixes per stage listed inline.
- Do NOT push, do NOT open a PR unless the operator explicitly asks.

## Scope

**In scope** (the only files this plan may modify or create):

- `package.json` — Stages 1, 3, 4, 5
- `pnpm-lock.yaml` — regenerated by `pnpm install` in Stages 1, 5 (commit as part of the same stage)
- `.github/workflows/ci.yml` — Stages 2, 5
- `renovate.json` — Stage 6
- `scripts/check-no-runtime-deps.mjs` — new, Stage 4
- `CONTRIBUTING.md` — new, Stage 7
- `AGENTS.md` — new, Stage 7
- `advisor-plans/README.md` — final status-row update

**Out of scope** (do NOT touch):

- Anything under `src/**` or `test/**` — including the in-flight `_types.ts` and overload work.
- `.github/workflows/autofix.yml` — this plan does not modify autofix; the separate workflow
  already handles README regeneration and lint-fix on PR.
- `README.md` — automd owns it. If `pnpm build` diffs `README.md` during your verification, that's
  a Stage 3 bug; do not commit the README diff.
- Adding new ESLint rules — separate plan if needed.
- Husky/pre-commit hooks — explicitly rejected in the audit.
- Bundle-size gate — explicitly rejected in the audit.

## Suggested executor toolkit

- `pnpm` (already pinned in `packageManager`).
- Node ≥ 20 locally (to match CI baseline). No functional dependence on Node version for the plan's
  own commands.
- `git`. No `git push` needed.

---

## Steps

Each stage is a self-contained commit. Stages are independent — if a later stage's STOP condition
fires, earlier stages still stand.

### Stage 1: Bump `vitest` + `@vitest/coverage-v8` to `^4.1.9` (DEP-01)

**Why**: `pnpm audit` at `f06c800` reports one HIGH advisory (`GHSA-fx2h-pf6j-xcff`, `vite ≤ 8.0.15`
`server.fs.deny` bypass) transitively via `vitest → vite`. Vite `8.0.16` ships in vitest `4.1.9`.
Dev-side only, but a HIGH advisory in `pnpm audit` output distracts every future security-oriented
audit.

**Precondition check** — run `pnpm audit --audit-level=high` first:
- Exit `0` with no HIGH advisories listed → **STOP Stage 1**. Someone else bumped. Record
  "REJECTED: already fixed upstream" in the plan status and skip to Stage 2.
- Exit non-zero and lists `GHSA-fx2h-pf6j-xcff` or equivalent HIGH → proceed.

**Edit `package.json`** — change these two lines in `devDependencies`:

```diff
-    "@vitest/coverage-v8": "^4.1.5",
+    "@vitest/coverage-v8": "^4.1.9",
```

```diff
-    "vitest": "^4.1.5"
+    "vitest": "^4.1.9"
```

Then:

```bash
pnpm install
pnpm audit --audit-level=high
pnpm test
```

**Verify**:
- `pnpm audit --audit-level=high` → exit `0`, no HIGH advisories.
- `pnpm test` → exit `0`, 509 tests pass (typecheck path unchanged).

**Commit**: `git add package.json pnpm-lock.yaml && git commit -m "chore(deps): bump vitest to ^4.1.9 for vite fs.deny CVE"`

---

### Stage 2: CI Node matrix — test on Node 20, 22, 24 (DEP-04)

**Why**: `ufo` is a universal library, but CI only exercises Node 20 (EOL 2026-04). Node 22 is LTS,
Node 24 is current. Cost is three parallel matrix legs at ~30s each.

**Edit `/Users/i584843/SAPDevelop/dev/ufo/.github/workflows/ci.yml`** — replace the whole file
contents with (note: matrix strategy added, `node-version` templated, codecov step gated to one
leg):

```yaml
name: ci

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22, 24]
    steps:
      - uses: actions/checkout@v6
      - run: npm i -fg corepack && corepack enable
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm vitest --coverage
      - if: matrix.node == 22
        uses: codecov/codecov-action@v6
```

**Verify**:
- Local YAML sanity: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` →
  exit `0`. (If `python3` yaml is not available, run
  `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`
  after `pnpm dlx js-yaml --version` to confirm parseability. Any parser will do; the point is that
  the file is valid YAML.)
- `pnpm test` locally on your current Node → still exit `0`.
- (Deferred, non-blocking) On next push, three matrix legs (`node 20`, `22`, `24`) run in parallel;
  codecov step only executes on the `22` leg. **You do NOT push in this plan** — this bullet is for
  the reviewer.

**Commit**: `git add .github/workflows/ci.yml && git commit -m "ci: matrix on Node 20, 22, 24; upload coverage from Node 22 only"`

**STOP for Stage 2**: If you have a way to trigger a dry-run on a fork or a local `act` run and the
Node 22 or 24 leg fails a test, **STOP** — that is a real cross-Node regression, not a matrix bug.
Report it as a new finding; do not adjust the matrix to make it green.

---

### Stage 3: Split `automd` from the `build` script (DEP-05)

**Why**: `"build": "automd && unbuild"` regenerates the README's API section on every local build,
producing unrelated `README.md` diffs that pollute PRs. `automd` should run at publish time, not
build time.

**Edit `package.json` `scripts` block** — three keys change, one new key added:

```diff
   "scripts": {
-    "build": "automd && unbuild",
+    "build": "unbuild",
+    "build:docs": "automd",
     "automd": "automd",
     "dev": "vitest",
     "lint": "eslint . && prettier -c src test",
     "lint:fix": "eslint --fix . && prettier -w src test",
-    "prepack": "pnpm build",
+    "prepack": "automd && unbuild",
     "release": "pnpm test && changelogen --release && npm publish && git push --follow-tags",
     "test": "pnpm lint && vitest run --typecheck"
   },
```

Rationale for the shape:
- `build` no longer touches `README.md`.
- `build:docs` is the explicit doc-regen entry (matches unjs naming conventions for other repos).
- `prepack` still runs both — publish keeps README in sync.
- `automd` script alias is retained because `autofix.yml` calls `pnpm automd`.

**Verify** — first make sure `README.md` is clean on disk, then:

```bash
git status --short README.md   # must be empty; if not, stash the README change first
pnpm build
git diff --stat README.md      # expected: empty (no diff)
pnpm prepack
git diff --stat README.md      # allowed to diff (this is prepack's job)
# revert any README changes prepack caused so they don't get committed:
git checkout -- README.md
```

**Commit**: `git add package.json && git commit -m "chore: split automd from build script (run on prepack instead)"`

---

### Stage 4: Codify the zero-runtime-deps invariant (DEP-06)

**Why**: `"dependencies": {}` in `package.json` is `ufo`'s #1 design property. Nothing enforces it.
A guard script + CI wiring means the first PR that adds a runtime dep fails CI at the source.

**Create `/Users/i584843/SAPDevelop/dev/ufo/scripts/check-no-runtime-deps.mjs`** with this exact
content:

```js
// Guards ufo's zero-runtime-dependency invariant.
// See advisor-plans/012-deps-ci-dx-hygiene.md (Stage 4) for rationale.
import pkg from "../package.json" with { type: "json" };

const deps = Object.keys(pkg.dependencies || {});
if (deps.length > 0) {
  console.error(
    "ufo must have zero runtime dependencies. Found:",
    deps.join(", "),
  );
  process.exit(1);
}
console.log("OK: zero runtime dependencies");
```

**Edit `package.json` `scripts` block** — add `check:no-deps` and prepend it to `test`:

```diff
   "scripts": {
     "build": "unbuild",
     "build:docs": "automd",
     "automd": "automd",
+    "check:no-deps": "node scripts/check-no-runtime-deps.mjs",
     "dev": "vitest",
     "lint": "eslint . && prettier -c src test",
     "lint:fix": "eslint --fix . && prettier -w src test",
     "prepack": "automd && unbuild",
     "release": "pnpm test && changelogen --release && npm publish && git push --follow-tags",
-    "test": "pnpm lint && vitest run --typecheck"
+    "test": "pnpm check:no-deps && pnpm lint && vitest run --typecheck"
   },
```

Note: `pnpm test` already fans out to `check:no-deps` → `lint` → `vitest run --typecheck`, so CI
inherits the guard automatically without a separate `ci.yml` step. Do NOT add a duplicate CI step
for this.

**Verify**:
- `pnpm check:no-deps` → exit `0`, prints `OK: zero runtime dependencies`.
- Negative test — temporarily add a bogus dep:
  ```bash
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.dependencies={foo:'1.0.0'};fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
  pnpm check:no-deps        # expect exit 1, error message listing "foo"
  git checkout -- package.json  # revert
  pnpm check:no-deps        # expect exit 0 again
  ```
- `pnpm test` → exit `0`, still passes (guard runs first, then lint, then vitest).

**Commit**: `git add scripts/check-no-runtime-deps.mjs package.json && git commit -m "chore: guard zero-runtime-dependency invariant in test script"`

---

### Stage 5: Add `attw` + `publint` package sanity gate (DX-04)

**Why**: `ufo` publishes ESM + CJS + `.d.ts`. `@arethetypeswrong/cli` catches the classic bug where
`.d.ts` doesn't match runtime shape under `moduleResolution: node16`. `publint` catches malformed
`exports` maps. Both are one-command tools; both belong in CI permanently.

**Edit `package.json`** — add two devDeps and one script:

```diff
   "scripts": {
     "build": "unbuild",
     "build:docs": "automd",
     "automd": "automd",
     "check:no-deps": "node scripts/check-no-runtime-deps.mjs",
     "dev": "vitest",
     "lint": "eslint . && prettier -c src test",
     "lint:fix": "eslint --fix . && prettier -w src test",
     "prepack": "automd && unbuild",
     "release": "pnpm test && changelogen --release && npm publish && git push --follow-tags",
+    "test:package": "attw --pack . && publint",
     "test": "pnpm check:no-deps && pnpm lint && vitest run --typecheck"
   },
   "devDependencies": {
+    "@arethetypeswrong/cli": "^0.18.2",
     "@types/node": "^25.6.0",
     "@vitest/coverage-v8": "^4.1.9",
     "automd": "^0.4.3",
     "changelogen": "^0.6.2",
     "eslint": "^10.2.1",
     "eslint-config-unjs": "^0.6.2",
     "jiti": "^2.6.1",
     "prettier": "^3.8.3",
+    "publint": "^0.3.14",
     "typescript": "^6.0.3",
     "unbuild": "^3.6.1",
     "untyped": "^2.0.0",
     "vitest": "^4.1.9"
   },
```

If either `@arethetypeswrong/cli` `^0.18.2` or `publint` `^0.3.14` doesn't resolve at install-time,
fall back to whatever `pnpm add -D -E @arethetypeswrong/cli publint` picks (latest); update the
version specifiers to the caret-ranges of the resolved versions. Do NOT switch to a different pair
of tools.

Then:

```bash
pnpm install
pnpm build           # produces dist/ that attw and publint can inspect
pnpm test:package
```

**Edit `.github/workflows/ci.yml`** — add ONE step after `pnpm build`:

```diff
       - run: pnpm install
       - run: pnpm lint
       - run: pnpm build
+      - run: pnpm test:package
       - run: pnpm vitest --coverage
       - if: matrix.node == 22
         uses: codecov/codecov-action@v6
```

**Verify**:
- `pnpm test:package` → exit `0`.
- `pnpm test` → still exit `0`.
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → exit `0`.

**STOP for Stage 5**: If `pnpm test:package` surfaces **more than 5 real issues** (attw errors or
publint errors, ignoring pure warnings), STOP. Those are their own remediation surface; do not
paper over them by adding suppressions. Report the issue list and land Stages 1–4 without Stage 5.
If it surfaces ≤ 5 real issues, land Stage 5 without fixes and file a follow-up finding for the
remediation; the plan's goal is the gate, not fixing what it finds.

**Commit**: `git add package.json pnpm-lock.yaml .github/workflows/ci.yml && git commit -m "ci: add attw + publint package sanity gate"`

---

### Stage 6: Pin Renovate for `vitest` + `@vitest/coverage-v8` (DEP-08)

**Why**: vitest's `--typecheck` (which `pnpm test` uses — see `"test": "... vitest run --typecheck"`)
is documented as experimental. A silent minor bump can change type-test semantics without any
runtime-test signal. Adding a `packageRules` override in `renovate.json` disables automerge and
tags the PR `needs-review` — a one-line human gate.

**Replace `/Users/i584843/SAPDevelop/dev/ufo/renovate.json`** with:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>unjs/renovate-config"],
  "packageRules": [
    {
      "matchPackageNames": ["vitest", "@vitest/coverage-v8"],
      "automerge": false,
      "labels": ["needs-review"]
    }
  ]
}
```

The `$schema` line is optional but harmless and helps editors validate.

**Verify**:
- `npx --package renovate -- renovate-config-validator renovate.json` → exit `0`, prints
  `SUCCESS`. (This may pull the `renovate` package the first time; that's fine — it's a one-shot
  invocation, not a devDep.)
- If `npx renovate-config-validator` is unavailable on your machine (network-restricted): fall back
  to `node -e "JSON.parse(require('fs').readFileSync('renovate.json','utf8')); console.log('json ok')"`
  and record in the commit body that schema validation was deferred.

**Commit**: `git add renovate.json && git commit -m "chore(renovate): require manual review for vitest bumps"`

---

### Stage 7: Add `CONTRIBUTING.md` + `AGENTS.md` (DX-06)

**Precondition** — check whether these files exist at `f06c800`:

```bash
git show f06c800 -- AGENTS.md CONTRIBUTING.md
```

- If either file **already exists at `f06c800`**, **STOP Stage 7** for that file specifically —
  respect existing content. If both exist, skip the stage entirely. (Verified at plan-time: neither
  exists.)

**Create `/Users/i584843/SAPDevelop/dev/ufo/CONTRIBUTING.md`** with this exact content:

```markdown
# Contributing to ufo

Thanks for considering a contribution! `ufo` is a small, zero-runtime-dependency URL utility
library. This document is the short version — enough to make a correct PR.

## Dev setup

```bash
corepack enable
pnpm install
pnpm test
```

`pnpm test` runs (in order) the zero-runtime-deps guard, ESLint + Prettier, and Vitest with
`--typecheck` (both runtime and type-level tests).

## Test structure

- `test/*.test.ts` — runtime behavior tests (Vitest).
- `test/types.test-d.ts` — type-level tests, run by Vitest's `--typecheck` mode.

Add cases for every bug fix. If you're changing a function's public signature, add or update the
matching type test.

## Build & `README.md`

- `pnpm build` runs `unbuild` and produces `dist/`. **It does not touch `README.md`.**
- `pnpm build:docs` runs `automd`, which regenerates the API section in `README.md` from the
  built types. Automd also runs automatically on `pnpm prepack` (publish) and on PRs via
  `.github/workflows/autofix.yml`.
- Do not hand-edit the automd-managed section of `README.md`; edit the source doc comments
  instead.

## Package sanity

Before opening a PR that changes `exports`, `types`, or the build output shape:

```bash
pnpm build
pnpm test:package   # attw + publint
```

## Commit style

Conventional commits. Examples from `git log`:

- `fix(parse): normalize IPv6 host brackets`
- `feat(utils): add withoutQuery`
- `chore(deps): bump vitest to ^4.1.9`

## Zero runtime dependencies

`ufo` publishes with `"dependencies": {}` and this is enforced in CI via
`scripts/check-no-runtime-deps.mjs`. If your change requires a new runtime dependency, open an
issue first — this is a design property, not an oversight.
```

**Create `/Users/i584843/SAPDevelop/dev/ufo/AGENTS.md`** with this exact content:

```markdown
# AGENTS.md — ufo

Guidance for AI coding agents working in this repository.

## Repo layout

- `src/` — library source. Barrel export from `src/index.ts`; core parsers in `src/parse.ts`;
  functional URL utilities in `src/utils.ts`; query helpers in `src/query.ts`; vendored punycode
  in `src/punycode.ts`.
- `test/` — Vitest suites. Runtime tests: `test/*.test.ts`. Type tests: `test/types.test-d.ts`
  (run by `vitest --typecheck`).
- `dist/` — build output. Do NOT commit changes here; `unbuild` regenerates on `pnpm build`.
- `scripts/` — repo scripts. Currently: `check-no-runtime-deps.mjs`.

## Hot files (understand these before proposing changes)

- `src/utils.ts` — largest module; functional URL builders (`joinURL`, `withBase`, `withQuery`,
  `withFragment`, etc.). Many hot paths.
- `src/parse.ts` — `parseURL`, `parsePath`, `parseHost`, `parseAuth`, `stringifyParsedURL`.
  Interacts closely with `src/utils.ts`.

## Coding style

- **Zero runtime dependencies.** Enforced by `scripts/check-no-runtime-deps.mjs`. Do not add to
  `"dependencies"`. Dev-only tools go in `"devDependencies"`.
- **No DOM assumptions.** `ufo` runs in Node, browsers, workers, edge runtimes, Deno, Bun. Do not
  reference `window`, `document`, `location`, or any browser-only global from `src/**`.
- **No implicit `new URL()`.** `ufo`'s value proposition is a functional, WHATWG-adjacent API
  distinct from the WHATWG `URL` class. Use `parseURL` / `stringifyParsedURL`.
- **Formatting**: Prettier (default config, `{}`), 2-space indent, double quotes, semicolons.
  `pnpm lint:fix` autoformats.

## Verification commands

```bash
pnpm install            # sync deps
pnpm test               # zero-deps guard + lint + vitest (--typecheck)
pnpm build              # unbuild only (no README rewrite)
pnpm build:docs         # regenerate README via automd
pnpm test:package       # attw + publint (requires pnpm build first)
```

## Gotchas

- **`automd` rewrites `README.md`** on `pnpm build:docs`, `pnpm prepack`, and via
  `.github/workflows/autofix.yml`. Local `pnpm build` no longer touches `README.md` (as of plan
  012, Stage 3). If you see a `README.md` diff after a plain `pnpm build`, you are on an old
  version of `package.json`.
- **In-flight `src/_types.ts` + refined overloads** may be present as uncommitted work when you
  join. Do not commit it as part of unrelated work; it ships independently as v1.7 (direction
  plan D1). If you need to make source changes, ask the operator whether the in-flight tree is
  supposed to be preserved.
- **`test/types.test-d.ts` is invisible in CI until plan 001 lands** (`--typecheck` in CI). Locally
  it runs via `pnpm test`, but a green GitHub check does not currently prove type-test coverage.
- **Package manager is `pnpm@10.33.2`** (pinned). Do not run `npm install` or `yarn`.
- **Conventional commits.** Match `git log --format=%s | head`.
```

**Verify**:
- Both files exist: `ls -la CONTRIBUTING.md AGENTS.md` → both present.
- Markdown is well-formed: `pnpm lint` → exit `0` (Prettier only checks `src` + `test`, so this is
  a redundant sanity check; the real check is that no lint change is required).
- Grep sanity: `grep -c 'zero runtime' CONTRIBUTING.md AGENTS.md` → both `≥ 1`.

**Commit**: `git add CONTRIBUTING.md AGENTS.md && git commit -m "docs: add CONTRIBUTING.md and AGENTS.md"`

---

### Stage 8: Update `advisor-plans/README.md` status row

After all six functional stages land (or after their STOP conditions are recorded), update the
plan's row in `/Users/i584843/SAPDevelop/dev/ufo/advisor-plans/README.md`.

At plan-time, plan 012 is not yet listed in the README index (the index currently covers 001–008
only). Append a new row to the "Execution order & status" table:

```markdown
| 012  | Deps, CI, and DX hygiene (6 hygiene findings consolidated) | P2       | M      | 001        | deps + dx     | DONE       |
```

Status values: use `DONE` if all six stages committed, `PARTIAL: stages 1–N landed, M–6 skipped (reason)` otherwise.

Also remove or annotate the corresponding bullets in the "Audit summary — Batch 2 (plans 009+)"
section, specifically the deps-hygiene line that mentions "DEP-01 (vitest 4.1.9 for vite CVE),
DEP-06 (guard zero-runtime-deps invariant), DEP-04 (Node matrix 20/22/24)" — replace with a note
that these were consolidated into plan 012.

**Verify**:
- `grep -c '^| 012' advisor-plans/README.md` → `1`.

**Commit**: `git add advisor-plans/README.md && git commit -m "docs: mark plan 012 status in advisor-plans index"`

---

## Test plan

No new runtime or type tests. Each stage has its own verification command listed inline. Aggregate
post-plan checks:

- `pnpm audit --audit-level=high` → exit `0`.
- `pnpm test` → exit `0`, still 509 tests pass, zero-deps guard prints `OK`.
- `pnpm build` → exit `0`, `git diff --stat README.md` empty.
- `pnpm test:package` → exit `0`.
- `npx --package renovate -- renovate-config-validator renovate.json` → exit `0` (or JSON-parse
  fallback recorded in commit body).
- `ls CONTRIBUTING.md AGENTS.md scripts/check-no-runtime-deps.mjs` → all present.

## Done criteria

Machine-checkable. ALL must hold (unless a STOP condition explicitly landed a subset):

- [ ] `pnpm test` exits `0`
- [ ] `pnpm audit --audit-level=high` exits `0`
- [ ] `pnpm build` exits `0` AND leaves `README.md` unchanged
- [ ] `pnpm test:package` exits `0` (unless Stage 5 STOP fired; record in the plan status row)
- [ ] `scripts/check-no-runtime-deps.mjs` exists AND `pnpm check:no-deps` exits `0`
- [ ] `renovate.json` contains a `packageRules` entry for `vitest` + `@vitest/coverage-v8`
- [ ] `.github/workflows/ci.yml` contains `matrix: node: [20, 22, 24]` AND the codecov step is
      gated with `if: matrix.node == 22` AND has a `pnpm test:package` step after `pnpm build`
- [ ] `CONTRIBUTING.md` and `AGENTS.md` exist
- [ ] `git status --short` shows only the in-flight `_types.ts` work you inherited — no other
      untracked or modified files remain
- [ ] `git log --oneline advisor/012-deps-ci-dx-hygiene ^main | wc -l` → 7 commits (6 functional +
      1 index update), unless a STOP short-circuited a stage
- [ ] `advisor-plans/README.md` has a status row for plan 012

## STOP conditions

Stop and report back (do not improvise) if:

- The Stage 1 precondition fires — `pnpm audit --audit-level=high` already exits `0` at plan start.
  Record `Stage 1: REJECTED (already fixed upstream)` and continue with Stage 2.
- Any stage's `pnpm test` fails after the edit — investigate once, and if the fix is not obvious
  from the diff, STOP that stage. The other stages remain independent.
- Stage 2: A `pnpm vitest --typecheck` locally on Node 22 or Node 24 (if you can install those
  Nodes) fails a test with an error different from the Node 20 result. That is a real cross-Node
  regression finding — record it as a new finding, do NOT patch the test.
- Stage 5: `pnpm test:package` reports more than 5 real issues (attw or publint errors, not
  warnings). Land Stages 1–4 and Stage 6/7 without Stage 5; file the issue count as a follow-up.
- Stage 7: `AGENTS.md` or `CONTRIBUTING.md` already exists at commit `f06c800`. Respect existing
  content; skip that file's creation.
- Drift check at plan start shows any in-scope file changed since `f06c800` — compare the "Current
  state" excerpts against live code. On any mismatch, STOP and report; do not proceed on stale
  assumptions.
- You find yourself needing to touch any file under `src/**` or `test/**`, or `.github/workflows/autofix.yml`,
  or `README.md`. STOP — those are out of scope for this plan.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- The Renovate override for `vitest` is a **defensive one-time** measure. When vitest's `--typecheck`
  graduates to stable (documented in vitest release notes), drop the `packageRules` override so
  automerge resumes.
- `attw` + `publint` should remain in CI even after this plan — they're low-cost, high-signal, and
  catch a class of publishing bugs that has bitten multiple unjs packages historically.
- The zero-runtime-deps check is the library's #1 property guardrail. **Reviewers should reject any
  PR that adds to `"dependencies"`** unless it's explicitly discussed in an issue first.
- The Node matrix should track LTS + current. When Node 20 hits EOL (2026-04), drop it from the
  matrix and add whatever the new current release is (Node 26 as of the next audit cycle).
- `AGENTS.md` and `CONTRIBUTING.md` should be kept current when the build/test/lint commands
  change — treat them as part of the surface you own.
- The `build` / `build:docs` / `prepack` split is load-bearing: if a future maintainer collapses
  them back, local `pnpm build` will start dirtying `README.md` again and every PR will pick up a
  spurious diff.
