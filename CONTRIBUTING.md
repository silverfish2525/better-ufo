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
