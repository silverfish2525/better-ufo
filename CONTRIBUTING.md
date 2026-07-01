# Contributing to better-ufo

Thanks for considering a contribution! `better-ufo` is a small, zero-runtime-dependency URL
utility library — a security-hardened, WHATWG-conformant fork of
[`unjs/ufo`](https://github.com/unjs/ufo). This document is the short version — enough to make
a correct PR.

## Dev setup

```bash
corepack enable
pnpm install
pnpm test
```

`pnpm test` runs (in order) the zero-runtime-deps guard, `knip`, ESLint (type-aware via
`@antfu/eslint-config`), and Vitest with `--typecheck` (both runtime and type-level tests).

## Test structure

- `tests/*.test.ts` — runtime behavior tests (Vitest).
- `tests/types.test-d.ts` — type-level tests, run by Vitest's `--typecheck` mode.
- `tests/fixture/urltestdata.json` — vendored WHATWG WPT fixture, used by the parity ratchet.

Add cases for every bug fix. If you're changing a function's public signature, add or update the
matching type test.

## Build & `README.md`

- `pnpm build` runs `tsdown` and produces `dist/` (ESM + CJS + `d.mts` + `d.cts`). **It does not
  touch `README.md`.**
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
pnpm check:size     # size-limit (5 gates)
```

## Commit style

Conventional commits. Examples from `git log`:

- `fix(parse): normalize IPv6 host brackets`
- `feat(utils): add withoutQuery`
- `chore(deps): bump vitest to ^4.1.9`

## Zero runtime dependencies

`better-ufo` publishes with `"dependencies": {}` and this is enforced in CI via
`scripts/check-no-runtime-deps.ts`. If your change requires a new runtime dependency, open an
issue first — this is a design property, not an oversight.

## WPT (Web Platform Tests) URL parity ratchet

`tests/wpt-urltestdata.test.ts` runs a subset of the WHATWG `urltestdata.json` fixture against
`parseURL` and asserts host / pathname / search / hash parity with the browser output.

- **Fixture location**: `tests/fixture/urltestdata.json` (upstream `web-platform-tests`).
- **Slice tested**: first `INITIAL_LIMIT` (currently 100) special-scheme cases where
  `c.failure` is falsy. Non-special schemes and failure cases are not tested yet.
- **Known-divergent cases** are listed in the `EXPECTED_FAILURES` `Set<string>` at the top of
  the file and run via `it.fails` (asserts that the case still diverges).
- **When you fix a WHATWG-parity bug**: run `pnpm vitest run tests/wpt-urltestdata.test.ts`.
  If an `it.fails` entry now passes, the runner errors with `Expect test to fail`. Remove
  that entry from `EXPECTED_FAILURES` in the same commit as the fix. The ratchet only ever
  goes down.
- **Never add an entry to `EXPECTED_FAILURES` to make a red test go green.** New divergences
  either mean the fix regressed WHATWG parity (revert) or the fixture case genuinely does
  not apply to `better-ufo`'s WHATWG-adjacent stance (needs discussion, not silent skip).

## Deferred work (v2 slate)

Correctness deltas that are semver-major or that require a design decision live in
[`docs/v2-plan.md`](docs/v2-plan.md). Grep for `TODO(v2)` in `src/` to see the in-source
counterparts.

## Upstream references

Historical PR / issue references in comments (`unjs/ufo#237`, etc.) intentionally point to
upstream. Only rewrite those when the referenced work is closed and archived, or when it has
moved.
