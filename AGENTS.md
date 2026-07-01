# AGENTS.md — better-ufo

Guidance for AI coding agents working in this repository.

## Repo layout

- `src/` — library source. Barrel export from `src/index.ts`; core parsers in `src/parse.ts`;
  functional URL utilities in `src/utils.ts`; query helpers in `src/query.ts`; vendored punycode
  in `src/punycode.ts`.
- `tests/` — Vitest suites. Runtime tests: `tests/*.test.ts`. Type tests: `tests/types.test-d.ts`
  (run by `vitest --typecheck`). WPT fixture: `tests/fixture/urltestdata.json`.
- `dist/` — build output. Do NOT commit changes here; `tsdown` regenerates on `pnpm build`.
- `scripts/` — repo scripts. Currently: `check-no-runtime-deps.ts` (loaded via `jiti`).
- `advisor-plans/` — the 21 self-authored improvement plans that drove the fork.

## Hot files (understand these before proposing changes)

- `src/utils.ts` — largest module; functional URL builders (`joinURL`, `withBase`, `withQuery`,
  `withFragment`, etc.). Many hot paths.
- `src/parse.ts` — `parseURL`, `parsePath`, `parseHost`, `parseAuth`, `stringifyParsedURL`.
  Interacts closely with `src/utils.ts`.
- `src/_types.ts` — the type-level fold utilities (`AllStringLiteral`, `Refine`, `FoldJoin`,
  `QueryParts`, etc.). Every literal-preserving overload depends on this file. Read before
  touching return types.

## Coding style

- **Zero runtime dependencies.** Enforced by `scripts/check-no-runtime-deps.ts`. Do not add to
  `"dependencies"`. Dev-only tools go in `"devDependencies"`.
- **No DOM assumptions.** `better-ufo` runs in Node, browsers, workers, edge runtimes, Deno, Bun.
  Do not reference `window`, `document`, `location`, or any browser-only global from `src/**`
  (the deprecated `$URL` class is the sole exception — it implements the `URL` interface, whose
  types come from the `DOM` lib).
- **No implicit `new URL()`.** `better-ufo`'s value proposition is a functional, WHATWG-adjacent
  API distinct from the WHATWG `URL` class. Use `parseURL` / `stringifyParsedURL`.
- **Formatting**: `@antfu/eslint-config` (type-aware). `pnpm lint:fix` autoformats + fixes.

## Verification commands

```bash
pnpm install            # sync deps
pnpm test               # zero-deps guard + knip + lint + vitest (--typecheck)
pnpm build              # tsdown — ESM + CJS + d.mts + d.cts
pnpm build:docs         # regenerate README via automd
pnpm test:package       # attw + publint (requires pnpm build first)
pnpm check:size         # size-limit (5 gates)
```

## Gotchas

- **`automd` rewrites `README.md`** on `pnpm build:docs` and `pnpm prepack`, and via
  `.github/workflows/autofix.yml`. Local `pnpm build` no longer touches `README.md`.
- **Package manager is `pnpm@10.33.2`** (pinned exactly — corepack requires an exact version).
  Do not run `npm install` or `yarn`.
- **Conventional commits.** Match `git log --format=%s | head`.
- **Upstream vs fork.** This is `better-ufo`, a fork of `unjs/ufo`. Historical PR / issue
  references in comments (`unjs/ufo#237`, etc.) intentionally point to upstream. Only rewrite
  those when the referenced work is now closed or when it has migrated.
