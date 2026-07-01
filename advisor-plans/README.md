# ufo advisor plans — index

Deep-audit output. **Advisor role: read-only plans, no source changes.** 14 plans covering 60+ findings from the audit at baseline `f06c800` (2026-07-01).

Each plan is self-contained, executor-consumable, and follows `.agents/skills/improve/references/plan-template.md`. STOP conditions are baked in so an executor can safely halt without inventing a fix.

---

## Priority-ranked index

| # | Plan | Priority | Effort | Risk | Depends on | Category | Findings covered |
|---|---|---|---|---|---|---|---|
| 001 | verification-baseline | P1 | M | LOW | — | tests + dx | DX-01, DX-02, TEST-01/02/03/06 |
| 002 | sec-01 script-protocol-bypass | P1 | S | MED | 001 | security | SEC-01, DEBT-03 |
| 003 | sec-02 open-redirect (joinURL/withBase) | P1 | S | MED | 001 | security | SEC-02 | DONE |
| 004 | sec-03/04 WHATWG scheme + authority parity | P1 | M | MED-HIGH | 001, 002 | security | SEC-03, SEC-04 |
| 005 | corr-01 parseHost IPv6 | P1 | S | LOW-MED | 001 | bug | CORR-01 |
| 006 | corr-02/04 withBase/withoutBase fragment | P1 | S | LOW | 001 | bug | CORR-02, CORR-04 |
| 007 | corr-03/06 parseAuth + opaque schemes | P1 | M | MED | 001, 004 | bug | CORR-03, CORR-06 |
| 008 | tsconfig extreme-strict (non-defaults only) | P1 | M | MED | 001 | dx | DX-03 (revised) |
| 009 | correctness cluster (minor bugs) | P2 | M | LOW | 001 | bug | CORR-05, CORR-07, CORR-09, CORR-12 |
| 010 | perf hot-paths | P2 | M | LOW-MED | 001 | perf | PERF-01, PERF-04 | DONE |
| 011 | tech-debt refactor (utils.ts split etc.) | P3 | L | MED | 001, 005-007 | tech-debt | DEBT-01, DEBT-02, DEBT-05, DEBT-08 |
| 012 | deps + CI + DX hygiene | P2 | M | LOW | 001 | deps + dx | DEP-01/04/05/06/08, DX-04/06 |
| 013 | test coverage expansion | P2 | M | LOW | 001 | tests | TEST-07, TEST-08, TEST-09, TEST-10 |
| 014 | direction: ship in-flight types as v1.7 | P1 | L | MED | 001, 008 | direction | D1, D2, D3, D6 |

**14 plans, ~504 KB total.** Each plan lands as its own PR (some as multiple staged commits within the PR).

---

## Recommended execution order

**Phase 1 — Gate (must land first, no exceptions)**
- **001** — pins characterization tests + closes CI `--typecheck` gap. Every other plan assumes 001 is live.

**Phase 2 — Security (parallel, high urgency)**
- **002** → **004** (004 depends on 002's `SPECIAL_SCHEMES` + `SCHEME_STRIP_RE`)
- **003** (independent of 002/004 — can land any time after 001)

**Phase 3 — Correctness (parallel after 001, 002/003/004 preferred first for FIXME markers)**
- **005** — parseHost IPv6
- **006** — withBase/withoutBase fragment
- **007** — parseAuth + opaque schemes (waits on 004 for `SPECIAL_SCHEMES`)
- **009** — correctness cluster minor (CORR-05/07/09/12); CORR-09 has soft dependency on 004

**Phase 4 — Quality (parallel)**
- **008** — tsconfig extreme-strict (independent; can land in Phase 2 or 3 if desired)
- **010** — perf hot-paths
- **012** — deps + CI + DX
- **013** — test coverage expansion

**Phase 5 — Release**
- **014** — finalize in-flight `_types.ts`, add `withoutQuery`, ship as v1.7.0
- **011** — tech-debt refactor (post-release; large diff, no user-visible change)

---

## Dependency graph

```
             001 (verification baseline — MUST land first)
              │
       ┌──────┼──────┬────────┬────────┬────────┬────────┬────────┐
       ▼      ▼      ▼        ▼        ▼        ▼        ▼        ▼
      002    003    005      006      008      010      012      013
       │              │        │
       ▼              │        │
      004────────────┐│        │
       │             ▼▼        │
       └───────▶ 007  009 ─────┘   ◀── 009 CORR-09 soft-dep on 004
                        │
                        ▼
                     011 (post-release refactor)
                        ▲
                        │
                       014 (v1.7 release; groups D1/D2/D3/D6)
                        ▲
                        │
                       008 (soft dep — strict semantics assumed by _types.ts)
```

---

## Findings coverage matrix

| Bucket | Total findings | Plans | Notes |
|---|---:|---|---|
| Security | SEC-01..08 | 002, 003, 004 | SEC-05..08 folded or rejected in audit — see per-plan out-of-scope. |
| Correctness | CORR-01..12 | 005, 006, 007, 009 | All 12 verified findings covered. |
| Perf | PERF-01/04 headline; PERF-02/03/05/06 recon | 010 | Only headline PERF-01 (regex hoist) + PERF-04 (fast-paths) are actionable. Rest are speculative. |
| Tech-debt | DEBT-01, 02, 03, 05, 08 | 002 (DEBT-03), 011 (rest) | DEBT-04/06/07/09 folded or dropped. |
| Tests | TEST-01..11 | 001 (01-06), 013 (07-10) | TEST-11 folded into 013 Stage 4 (type-tests baseline). |
| Deps | DEP-01/04/05/06/08 | 012 | DEP-02 covered by plan 008 (`types: []`). DEP-03/07 out. |
| DX | DX-01..07 | 001, 008, 012, 014 | DX-03 restructured to "no defaults" per empirical TS 6.0.3 probe. |
| Direction | D1/D2/D3/D6 | 014 | D4 in plan 011 Stage 3. D5 (URL template builder) deferred to v2 — noted in 014 maintenance. |

**Total findings addressed: ~61** across the 14 plans (34 headline + 27 lower-leverage from the leverage table).

---

## Rejected (in audit — do NOT plan)

- `noPropertyAccessFromIndexSignature` (audit DX proposal) — hostile to `parseQuery(str).foo` ergonomics.
- Husky pre-commit hooks — `.github/workflows/autofix.yml` already handles the format+lint autofix loop.
- Bundle-size gate in CI — micro-library, tree-shakeable, no runtime deps; a size gate would fight `sideEffects: false` benefits.
- Full WPT `urltestdata.json` run — infeasible at current WHATWG-parity level; plan 013 wires a subset with ratcheted skip-list.
- Undeprecating `$URL` — plan 011 Stage 3 commits to a v2 removal timeline instead.
- URL template builder (`buildURL<"/users/:id">({id: "u1"})`) — deferred to v2 design spike (noted in plan 014).
- `dependencies` version-pinning — repo is a leaf library with zero runtime deps; `devDependencies` handled by shared Renovate config + plan 012 vitest override.

---

## Uncommitted working-tree state (context for every plan)

At baseline `f06c800`, the working tree contains uncommitted in-flight type-safety work:

- `src/_types.ts` (NEW, ~14 KB) — template-literal type engine.
- `src/{index,parse,query,utils}.ts` — refined overloads on ~12 public functions.
- `test/types.test-d.ts` — 18 type-level tests.
- `tsconfig.json` — spurious `strict: true` addition (TS 6.0.3 default; remove per plan 008/014).

Plan 014 finalizes and ships this as v1.7.0. Plans 001-013 must NOT disturb this working tree; each plan's STOP conditions call out this constraint explicitly.

---

## Verification per plan

Every plan carries:
- **Drift check** at the top: `git diff --stat f06c800..HEAD -- <in-scope files>` — executor runs first.
- **STOP conditions** — halt criteria, not improvisation prompts.
- **Per-stage verify commands** — every step has an exit-code gate.
- **Test plan** — what green looks like.
- **Category tag**: security | bug | perf | tech-debt | tests | deps | dx | direction.
- **Planned at**: commit SHA + date.

---

## Read-only advisor contract

These plans are the **only** advisor output. The advisor made NO source changes to `unjs/ufo`. In-flight `_types.ts` and overloads existed BEFORE the audit (part of an unrelated ongoing session) and are treated as external state.
