# Plan 010: Hoist `JOIN_SEGMENT_SPLIT_RE` and add fast-path guards to `withFragment`/`withoutFragment`/`withoutHost`

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this
> plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f06c800..HEAD -- src/utils.ts test/utilities.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.
>
> **In-flight work**: the working tree at plan-time already contains uncommitted edits to
> `src/_types.ts` and refined overloads in `src/utils.ts` (see plan 001 / D1). Do NOT stage or
> commit any of those files as part of executing this plan — only the specific edits below.

## Status

- **Priority**: P2
- **Effort**: M (S per fix × 2 stages)
- **Risk**: LOW (Stage 1 — mechanical hoist) + LOW-MED (Stage 2 — fast-path skips must match
  full-path semantics on the inputs they handle; requires dense tests + conservative guards)
- **Depends on**: `advisor-plans/001-verification-baseline.md`
- **Category**: perf
- **Planned at**: commit `f06c800`, 2026-07-01
- **Issue**: —

## Why this matters

`ufo` is a zero-dep URL manipulation library consumed by Nuxt / Nitro / H3 / ofetch on effectively
every HTTP request in that ecosystem. Two small, independent hot-path inefficiencies exist:

1. `joinRelativeURL` defines a regex literal **inside** the function body — the only function-scoped
   regex in `src/utils.ts` (all others are hoisted at lines 27–32). Modern JS engines cache regex
   literals so the perf impact is small, but the **style inconsistency** is a real bug: future
   contributors will follow the wrong pattern.
2. `withFragment`, `withoutFragment`, and `withoutHost` each do a full `parseURL` +
   `stringifyParsedURL` round-trip even for inputs where the mutation is a trivial string edit
   (e.g. `withoutFragment("https://a.com/b")` with no `#` present just needs to return `input`
   unchanged). These are called defensively on every incoming URL in some middleware.

After this plan: the regex is module-scoped like its siblings; the three "with*" functions
short-circuit on inputs the fast-path can handle without loss of behavior.

**No public API change. No behavior change on any tested input.** Perf improvement is not gated
by CI — a micro-benchmark is provided as optional recon.

## Current state

### Files in play

- `src/utils.ts` — hosts `joinRelativeURL`, `withFragment`, `withoutFragment`, `withoutHost` and the
  module-scoped regex block (lines 27–32).
- `src/parse.ts` — `parseURL` and `stringifyParsedURL`. `parseURL` performs normalization side
  effects (e.g. **lowercases the protocol** at `src/parse.ts` in the `return { protocol:
  protocol.toLowerCase(), ... }` branch) — this is why the fast-paths in Stage 2 must be
  conservative.
- `src/encoding.ts` — `encodeHash` (used by `withFragment`).
- `test/utilities.test.ts` — existing tests for the four target functions
  (`joinRelativeURL`, `withFragment`, `withoutFragment`, `withoutHost`).

### Excerpt — module-scoped regex block (`src/utils.ts:27-32`)

```ts
const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
const PROTOCOL_RELATIVE_REGEX = /^([/\\]\s*){2,}[^/\\]/;
const PROTOCOL_SCRIPT_RE = /^[\s\0]*(blob|data|javascript|vbscript):$/i;
const TRAILING_SLASH_RE = /\/$|\/\?|\/#/;
const JOIN_LEADING_SLASH_RE = /^\.?\//;
```

### Excerpt — function-scoped regex inside `joinRelativeURL` (`src/utils.ts:~521`)

```ts
export function joinRelativeURL(..._input: string[]): string {
  // Inlined regex to increase browser compatibility
  const JOIN_SEGMENT_SPLIT_RE = /\/(?!\/)/;

  const input = _input.filter(Boolean);
  // ...
  for (const i of input) {
    // ...
    for (const [sindex, s] of i.split(JOIN_SEGMENT_SPLIT_RE).entries()) {
      // ...
    }
  }
  // ...
}
```

The comment `// Inlined regex to increase browser compatibility` is misleading — module-scoped
regex literals have the same browser compatibility as function-scoped ones. Remove the comment
along with the move.

### Excerpt — current `withFragment` (`src/utils.ts:~820`)

```ts
export function withFragment(input: string, hash: string): string {
  if (!hash || hash === "#") {
    return input;
  }
  const parsed = parseURL(input);
  parsed.hash = hash === "" ? "" : `#${encodeHash(hash)}`;
  return stringifyParsedURL(parsed);
}
```

Note: when `hash` is empty/"#", `withFragment` **already** returns `input` unchanged (no
normalization). When `hash` is non-empty, it round-trips through `parseURL` which lowercases the
protocol and normalizes host/pathname.

### Excerpt — current `withoutFragment` (`src/utils.ts:~843`)

```ts
export function withoutFragment(input: string): string {
  return stringifyParsedURL({ ...parseURL(input), hash: "" });
}
```

### Excerpt — current `withoutHost` (`src/utils.ts:~864`)

```ts
export function withoutHost(input: string) {
  const parsed = parseURL(input);
  return (parsed.pathname || "/") + parsed.search + parsed.hash;
}
```

### Existing tests to preserve (`test/utilities.test.ts`)

- `describe("withFragment", …)` — 7 cases starting at line ~279.
- `describe("withoutFragment", …)` — 5 cases starting at line ~321.
- `describe("withoutHost", …)` — 5 cases starting at line ~352.
- `describe("joinRelativeURL", …)` — earlier in the file (imported at line ~1–20).

None of the existing cases assert a normalization side-effect that the Stage 2 fast-paths would
break (all inputs are already lowercased protocols, no double-slashes in the pre-`#` portion,
etc.). This is the invariant Stage 2 relies on — the STOP conditions below re-verify it.

### Repo conventions

- **Regex hoisting**: all regex literals live at module top, uppercase-underscore names, `_RE` or
  `_REGEX` suffix. See `src/utils.ts:27-32` and `src/encoding.ts:6-20`.
- **Conventional Commits**: `perf(scope): …` for perf work. See `git log --oneline -5` — recent
  commits use `fix(withoutBase): …`, `chore(deps): …`.
- **Zero deps**: do NOT add any dependency. This is enforced by future plan DEP-06.
- **Tests use `vitest`**, `test/utilities.test.ts` pattern: `describe(…)` + a `tests` array + a
  `for (const t of tests) test(...)` loop. Match the shape when adding new cases.
- **Public `files` in `package.json`** is `["dist"]` only — anything outside `dist/` (including
  `bench/`) is automatically excluded from the npm package. No `.npmignore` needed.

## Commands you will need

| Purpose             | Command                                      | Expected on success               |
| ------------------- | -------------------------------------------- | --------------------------------- |
| Install             | `pnpm install`                               | exit 0                            |
| Full test suite     | `pnpm test`                                  | 509 pre-existing tests pass       |
| Filter tests        | `pnpm test test/utilities.test.ts`           | all cases in that file pass       |
| Type check          | `pnpm test` runs typecheck via vitest config | no TS errors                      |
| Build               | `pnpm build`                                 | exit 0, `dist/` produced          |
| Lint                | `pnpm lint`                                  | exit 0                            |
| Micro-bench (opt.)  | `node bench/perf-04.mjs`                     | prints ns/op numbers, no throw    |

If any command deviates from `package.json` scripts, prefer the `package.json` script.

## Scope

**In scope** (the only files you should modify):

- `src/utils.ts`
- `test/utilities.test.ts` (append fast-path cases only — do not edit existing cases)
- `bench/perf-04.mjs` (optional; create only if you choose to run the micro-bench)
- `advisor-plans/README.md` (status row update only, at the end)

**Out of scope** (do NOT touch, even though they look related):

- `src/_types.ts` — owned by the in-flight D1 work; must remain uncommitted through this plan.
- `src/parse.ts` — `parseURL`/`stringifyParsedURL` optimization is deliberately deferred.
- `src/encoding.ts` — no changes.
- Any correctness fix to `withFragment` / `withoutFragment` / `withBase` / `withoutBase` — plans
  005, 006, 007 own those. If a correctness bug becomes visible during this work, log it in the
  final report but do NOT fix it here.
- Adding a `.npmignore` — the `files: ["dist"]` allowlist already keeps `bench/` out of the
  published tarball. Verify (not modify) this in Done criteria.

## Git workflow

- Branch: `advisor/010-perf-hot-paths` (create from current `main`).
- One commit per stage:
  - Stage 1: `perf(utils): hoist JOIN_SEGMENT_SPLIT_RE to module scope`
  - Stage 2: `perf(utils): fast-path guards for withFragment/withoutFragment/withoutHost`
- Do NOT push and do NOT open a PR unless the operator explicitly instructs it.

## Steps

### Stage 1 — PERF-01: Hoist `JOIN_SEGMENT_SPLIT_RE` to module scope

**1.1 Baseline check** — before any edit:

```
pnpm install
pnpm test
```

Expected: 509 tests pass. If not → STOP (see "STOP conditions").

**1.2 Sweep for other function-scoped regex** in `src/`:

```
grep -nE "^\s+const [A-Z_]+ *= */" src/*.ts
```

Compare against the module-scoped block at `src/utils.ts:27-32` and `src/encoding.ts:6-20`. Expected
output: **one** hit inside `joinRelativeURL` for `JOIN_SEGMENT_SPLIT_RE`. Anything else that is a
function-scoped regex literal in production code (not a test file, not a symbol/enum, not a comment)
must be hoisted in the same commit. If a hit does NOT look like a regex literal (e.g. it's a
`const FOO = "bar";`), ignore it.

**1.3 Move the declaration.** Edit `src/utils.ts`:

- Delete the two lines inside `joinRelativeURL`:
  ```ts
  // Inlined regex to increase browser compatibility
  const JOIN_SEGMENT_SPLIT_RE = /\/(?!\/)/;
  ```
- Append to the module-scoped block after line 32 (after `JOIN_LEADING_SLASH_RE`):
  ```ts
  const JOIN_SEGMENT_SPLIT_RE = /\/(?!\/)/;
  ```

Keep the rest of `joinRelativeURL` byte-for-byte identical. The one existing use inside the
function (`i.split(JOIN_SEGMENT_SPLIT_RE)`) now resolves to the module-scoped binding.

**1.4 Verify no other reference relies on function scoping:**

```
grep -n JOIN_SEGMENT_SPLIT_RE src/
```

Expected: exactly two hits — one declaration, one use. If more, that is still fine (all uses will
resolve to the module const). If zero uses appear, you deleted the use by accident — revert and
retry.

**1.5 Run tests:**

```
pnpm test
```

Expected: still 509 tests pass. No new failures.

**1.6 Run lint:**

```
pnpm lint
```

Expected: exit 0.

**1.7 Commit:**

```
git add src/utils.ts
git commit -m "perf(utils): hoist JOIN_SEGMENT_SPLIT_RE to module scope"
```

Do NOT `git add -A` — the in-flight `src/_types.ts` work must stay uncommitted.

**Verify**: `git diff --stat HEAD~1` shows only `src/utils.ts` touched, net line count −1 (two
lines removed inside the function, one line added at module scope; the comment removal offsets).

---

### Stage 2 — PERF-04: Fast-path guards for `withFragment` / `withoutFragment` / `withoutHost`

**Guiding principle**: fast-paths must produce a result byte-identical to the current
`parseURL`+`stringifyParsedURL` implementation for every input they handle. When in doubt, fall
through to the existing slow path.

**2.1 Read the current implementations** (already excerpted in "Current state" above) and confirm
line numbers:

```
grep -n "^export function \(withFragment\|withoutFragment\|withoutHost\)" src/utils.ts
```

Expected: three hits, one per function.

**2.2 Semantics probe — mandatory before editing.** Create `scratch-probe.mjs` (temporary, not
committed) and run it to confirm the current normalization behavior on the specific inputs the
fast-paths will handle. Delete the file after.

```js
// scratch-probe.mjs
import { withFragment, withoutFragment, withoutHost } from "./dist/index.mjs";

const cases = [
  ["withoutFragment", () => withoutFragment("https://a.com/b")],
  ["withoutFragment", () => withoutFragment("https://A.com/b")],
  ["withoutFragment", () => withoutFragment("/a/b")],
  ["withoutFragment", () => withoutFragment("/a//b")],
  ["withFragment /b + h", () => withFragment("https://a.com/b", "h")],
  ["withFragment /b#old + new", () => withFragment("https://a.com/b#old", "new")],
  ["withFragment /b + empty", () => withFragment("https://a.com/b", "")],
  ["withoutHost /a/b", () => withoutHost("/a/b")],
  ["withoutHost https://a.com/b", () => withoutHost("https://a.com/b")],
];
for (const [name, fn] of cases) console.log(name, "=>", JSON.stringify(fn()));
```

Run `pnpm build && node scratch-probe.mjs`. Record output.

**STOP condition**: if `withoutFragment("https://A.com/b")` returns `"https://a.com/b"` (host
lowercased) or `withoutFragment("/a//b")` returns `"/a/b"` (double-slash collapsed) — normalization
side-effects are load-bearing on inputs a naive fast-path would match. Drop that function from the
fast-path OR restrict the guard further (see 2.3.b/c). Do NOT proceed without a decision. Log the
observed vs. expected output in the final report.

Delete `scratch-probe.mjs`.

**2.3 Edit `src/utils.ts` — add fast-paths.** Apply the following in order. Keep the existing
overload signatures untouched; only modify the **implementation** function bodies (the third
declaration in each overloaded triple).

**2.3.a `withFragment` implementation** — replace the body:

```ts
export function withFragment(input: string, hash: string): string {
  if (!hash || hash === "#") {
    return input;
  }
  // Fast-path: only when the input has no protocol/host normalization risk.
  // Conservative heuristic — bail out if the pre-'#' portion may need
  // normalization (uppercase protocol, backslashes, doubled slashes after the
  // authority segment). parseURL lowercases the protocol and normalizes host,
  // which the fast-path would skip.
  const hashIdx = input.indexOf("#");
  const preHash = hashIdx === -1 ? input : input.slice(0, hashIdx);
  if (
    !/[A-Z\\]/.test(preHash) // no uppercase, no backslash
    && !/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/\//.test(preHash) // no `//` after authority
  ) {
    return `${preHash}#${encodeHash(hash)}`;
  }
  const parsed = parseURL(input);
  parsed.hash = hash === "" ? "" : `#${encodeHash(hash)}`;
  return stringifyParsedURL(parsed);
}
```

**2.3.b `withoutFragment` implementation** — replace the body:

```ts
export function withoutFragment(input: string): string {
  // Fast-path 1: no fragment present -> `parseURL` + `stringifyParsedURL`
  // would only apply protocol/host normalization. Skip only when the input
  // is already normalized (no uppercase letters and no backslashes in the
  // authority-preceding portion, no doubled slashes after authority).
  if (
    !input.includes("#")
    && !/[A-Z\\]/.test(input)
    && !/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/\//.test(input)
  ) {
    return input;
  }
  return stringifyParsedURL({ ...parseURL(input), hash: "" });
}
```

**2.3.c `withoutHost` implementation** — replace the body:

```ts
export function withoutHost(input: string) {
  // Fast-path: input already has no host to strip. `hasProtocol(input,
  // { acceptRelative: true })` returning false means no scheme AND no
  // leading `//`, so parseURL would just parsePath(input) and return the
  // input unchanged (pathname+search+hash === input) — modulo an empty
  // pathname being rewritten to "/". Preserve the "|| '/'" edge here too.
  if (
    !hasProtocol(input, { acceptRelative: true })
    && input.length > 0
    && (input[0] === "/" || input[0] === "?" || input[0] === "#")
  ) {
    // Matches existing test case "?foo=123#hash" -> "/?foo=123#hash"
    // and "/a/b" -> "/a/b". Keep the "|| '/'" behavior for empty pathname.
    return input[0] === "/" ? input : `/${input}`;
  }
  const parsed = parseURL(input);
  return (parsed.pathname || "/") + parsed.search + parsed.hash;
}
```

If `hasProtocol` is not already imported in the file, it's defined locally in `src/utils.ts` —
verify with `grep -n "export function hasProtocol" src/utils.ts`. No import change needed.

**2.4 Run the full test suite:**

```
pnpm test
```

Expected: 509 pre-existing tests still pass. If ANY existing case in `describe("withFragment", …)`
or `describe("withoutFragment", …)` or `describe("withoutHost", …)` regresses → STOP. The
fast-path guard failed to preserve semantics; either tighten the guard further or drop that
function from the fast-path.

**2.5 Add new tests to `test/utilities.test.ts`.** Append inside the same three `describe` blocks
(do NOT create new files). Match the existing shape (`tests` array + `for … test(…)` loop) or
inline as sibling `test(…)` calls — pick whichever keeps the diff minimal.

New cases to add (each is a `test(...)` block):

Inside `describe("withoutFragment", …)`:

```ts
test("fast-path: no '#' returns input identity", () => {
  const input = "https://a.com/b";
  expect(withoutFragment(input)).toBe(input);
  // Identity — same reference when fast-path applied:
  expect(withoutFragment(input) === input).toBe(true);
});
test("fast-path: strips '#hash' from normalized input", () => {
  expect(withoutFragment("https://a.com/b#h")).toBe("https://a.com/b");
});
```

Inside `describe("withFragment", …)`:

```ts
test("fast-path: appends '#hash' to normalized input", () => {
  expect(withFragment("https://a.com/b", "h")).toBe("https://a.com/b#h");
});
test("fast-path: replaces existing '#hash'", () => {
  expect(withFragment("https://a.com/b#old", "new")).toBe("https://a.com/b#new");
});
test("empty hash delegates and returns input unchanged", () => {
  const input = "https://a.com/b";
  expect(withFragment(input, "")).toBe(input);
});
```

Inside `describe("withoutHost", …)`:

```ts
test("fast-path: host-less input returned unchanged", () => {
  expect(withoutHost("/a/b")).toBe("/a/b");
});
test("slow-path: strips authority from full URL", () => {
  expect(withoutHost("https://a.com/b")).toBe("/b");
});
```

**2.6 Re-run tests:**

```
pnpm test
```

Expected: `509 + 7 = 516` tests pass. Adjust the "+ 7" if you added a different count.

**2.7 Optional — micro-benchmark** (recon only; not committed to `dist/`, not gated by CI).

Only if you choose to gather perf evidence. Create `bench/perf-04.mjs`:

```js
// bench/perf-04.mjs — optional micro-bench. Not run in CI.
// Usage: pnpm build && node bench/perf-04.mjs
import { withFragment, withoutFragment, withoutHost } from "../dist/index.mjs";

const N = 100_000;
const cases = [
  ["withoutFragment (no #)", () => withoutFragment("https://a.com/b")],
  ["withoutFragment (with)", () => withoutFragment("https://a.com/b#h")],
  ["withFragment append", () => withFragment("https://a.com/b", "h")],
  ["withFragment replace", () => withFragment("https://a.com/b#o", "n")],
  ["withoutHost host-less", () => withoutHost("/a/b")],
  ["withoutHost full", () => withoutHost("https://a.com/b")],
];

for (const [label, fn] of cases) {
  fn(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) fn();
  const t1 = process.hrtime.bigint();
  const nsPerOp = Number(t1 - t0) / N;
  console.log(label.padEnd(28), nsPerOp.toFixed(1), "ns/op");
}
```

Run `pnpm build && node bench/perf-04.mjs`. Record numbers in the final report. Do NOT commit
`bench/perf-04.mjs` unless the operator explicitly asks — the plan does not require it landed.

If you DO commit it, verify it does not leak into the npm tarball:

```
pnpm build && pnpm pack --dry-run 2>&1 | grep -E "bench|\.mjs" || echo OK
```

Expected: `OK` (no `bench/` entries in the packed tarball). This holds because
`package.json`'s `"files": ["dist"]` allowlist excludes everything else — no `.npmignore` edit is
required.

**2.8 Lint + build:**

```
pnpm lint && pnpm build
```

Expected: both exit 0.

**2.9 Commit Stage 2:**

```
git add src/utils.ts test/utilities.test.ts
# only include bench/perf-04.mjs if the operator asked to commit it:
# git add bench/perf-04.mjs
git commit -m "perf(utils): fast-path guards for withFragment/withoutFragment/withoutHost"
```

Do NOT `git add -A`. The in-flight `src/_types.ts` work must remain uncommitted.

**Verify**: `git status` — only `src/_types.ts` (and any other in-flight D1 files) should be
listed as unstaged. Nothing else outside `src/utils.ts` / `test/utilities.test.ts` should be
touched.

---

### Stage 3 — Update the plan index

Edit `advisor-plans/README.md`: in the execution-order table, add a row for plan 010 (or update
the status of an existing row if one was pre-seeded):

```
| 010  | PERF-01 + PERF-04 hot-path fixes                          | P2       | M      | 001        | perf          | DONE       |
```

Commit:

```
git add advisor-plans/README.md
git commit -m "docs(advisor-plans): mark 010 done"
```

## Test plan

- **Non-regression**: every existing test in `describe("joinRelativeURL", …)`,
  `describe("withFragment", …)`, `describe("withoutFragment", …)`, `describe("withoutHost", …)`
  continues to pass unchanged. No existing assertion is edited.
- **New coverage** (7 cases, in `test/utilities.test.ts`):
  - `withoutFragment("https://a.com/b")` returns the input reference (`===`), exercising the
    no-`#` fast-path.
  - `withoutFragment("https://a.com/b#h")` returns `"https://a.com/b"`.
  - `withFragment("https://a.com/b", "h")` returns `"https://a.com/b#h"` (fast-path).
  - `withFragment("https://a.com/b#old", "new")` returns `"https://a.com/b#new"` (fast-path
    replace).
  - `withFragment("https://a.com/b", "")` returns `"https://a.com/b"` (existing empty-hash
    early return).
  - `withoutHost("/a/b")` returns `"/a/b"` (host-less fast-path).
  - `withoutHost("https://a.com/b")` returns `"/b"` (slow-path still correct).
- **Model after** the existing `describe`-with-`tests`-array structure in the same file (see the
  three existing blocks above the insertion sites).
- **Verification**: `pnpm test` → all pass, including the 7 new tests.
- **No perf gate in CI**. The micro-benchmark in `bench/perf-04.mjs` is optional executor recon.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm install` exits 0.
- [ ] `pnpm test` exits 0; the pre-existing 509 tests all pass; 7 new fast-path tests exist and
      pass (or the exact number matches what was added, if you consolidated cases).
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] `grep -n JOIN_SEGMENT_SPLIT_RE src/` shows the declaration at module scope in `src/utils.ts`
      (in the 27-line-ish block, not inside a function body), and at least one use.
- [ ] `grep -nE "^\s+const [A-Z_]+ *= */" src/*.ts` shows NO function-scoped regex literals in
      production `src/` files (test files exempt).
- [ ] `git status` shows only `src/_types.ts` (and any other pre-existing in-flight D1 files)
      unstaged. No file outside the "In scope" list is modified in your commits.
- [ ] Two commits landed on branch `advisor/010-perf-hot-paths` with `perf(utils): …` messages
      (plus a third `docs(advisor-plans): …` commit for the index).
- [ ] `pnpm pack --dry-run 2>&1 | grep -E "bench" || echo OK` prints `OK` (bench artifacts, if
      any, are excluded from the published tarball via `files: ["dist"]`).
- [ ] `advisor-plans/README.md` row for plan 010 reads `DONE`.

## STOP conditions

Stop and report back (do not improvise) if:

- **Drift**: `git diff --stat f06c800..HEAD -- src/utils.ts test/utilities.test.ts` shows changes
  that make the "Current state" excerpts no longer match the live code (line numbers may shift ±10;
  a structural mismatch — e.g. `withFragment` body no longer contains a `parseURL(input)` call — is
  a STOP).
- **Baseline red**: `pnpm test` fails BEFORE Stage 1 begins. Report the failing test names — do not
  attempt to fix.
- **Semantics probe (2.2) reveals normalization side-effects** on inputs the fast-paths would
  match. Specifically, if `withoutFragment("https://A.com/b") !== "https://A.com/b"` or
  `withoutFragment("/a//b") !== "/a//b"` — the fast-path in 2.3.b would regress that behavior.
  Either tighten the guard further (add more `/[capital-or-doubled-slash]/` rejections) OR drop
  that specific function from Stage 2 and note it in the report.
- **Existing test regresses** in Stage 2 after applying the guards in 2.3. The guard failed to
  preserve semantics for at least one existing input. Tighten (do NOT loosen) or drop the
  offending function.
- **`hasProtocol` isn't callable at the `withoutHost` site** (e.g. defined below it and function
  hoisting doesn't apply — should not happen since both are top-level `function` declarations, but
  verify with `pnpm test` fail signature `hasProtocol is not defined`). If so, STOP and report.
- **Any change out of scope becomes necessary** (e.g. you find yourself needing to edit
  `src/parse.ts` to make the fast-path work). Correctness-affecting parse.ts changes belong to
  plans 005/006/007 — do NOT touch here.
- **A step's verification fails twice** after a reasonable single-shot fix.
- **The in-flight `_types.ts` work has been committed or reverted** since plan-time — that is a
  scope violation that requires operator input before proceeding.

## Maintenance notes

- The Stage-2 fast-path guards use a **conservative heuristic** (`/[A-Z\\]/` reject +
  `//`-after-authority reject). This is intentionally overinclusive of the slow-path: any input the
  guard is uncertain about falls through to `parseURL`. If a future correctness fix in plans
  005/006/007 changes what `parseURL` normalizes, revisit the guard — it may need to widen (accept
  more inputs) or tighten (reject a new normalization category).
- If `stringifyParsedURL` is later optimized (out-of-scope plan), the fast-path benefit shrinks;
  the guards remain correct but become less impactful. Keep them anyway — they eliminate garbage
  allocation for the trivial cases.
- **Reviewer scrutiny**: (1) the regex-hoist is mechanically trivial — check for no name
  collision at module scope; (2) the fast-path guards' regex heuristics must match the actual
  `parseURL` normalization surface. Grep `parseURL` for every `.toLowerCase()`, `.replace(`, and
  `parsePath` call to enumerate — the guard should reject any input that would trip one of them.
- **Deferred out of this plan**:
  - `stringifyParsedURL` structural optimization (composes 5 string concats — could be a single
    template literal). Rejected by the audit as too small to matter.
  - `parseURL` regex-fusion (three regex matches in sequence). Rejected — not in the top-5 hot
    paths per audit measurement.
  - Landing `bench/perf-04.mjs` permanently in the repo. Only commit if the operator asks — this
    plan treats it as scratch recon.
