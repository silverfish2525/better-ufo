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
