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

## $URL → functional API mapping

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

---

## v2 slate — deferred correctness / design deltas

The items below are semver-major and are being held for v2. Each one has an
in-source `TODO(v2)` counterpart so `grep -rn 'TODO(v2)' src` and this list
stay in lock-step. Order is not priority; each item is independently
addressable.

### V2-01. Percent-encode userinfo on parse

- **Source marker**: `src/parse.ts` — `TODO(v2)` inside `parseAuth`.
- **Current**: `parseAuth` percent-decodes `username` and `password` for
  ergonomics, but `stringifyParsedURL` re-emits them verbatim. Any raw `@`,
  `:`, `/`, `?`, `#` originally present as `%XX` in the userinfo will not
  survive a `parseURL` -> `stringifyParsedURL` round-trip.
- **RFC**: RFC 3986 §3.2.1 requires percent-encoding on serialisation.
- **Migration**: on parse, decode only for the object shape; on serialise,
  percent-encode. Callers that manipulate `parsed.auth` as an opaque blob
  will see percent triples they didn't before.

### V2-02. IPv6 zone-id normalisation

- **Source marker**: `src/parse.ts` — `TODO(v2)` inside `parseHost` IPv6 fast
  path.
- **Current**: `[fe80::1%25eth0]` parses with the zone-id (`%eth0`) preserved
  inside the hostname string, un-normalised. WHATWG spec requires percent-
  encoding the zone-id delimiter and applying a stricter zone-id grammar.
- **Migration**: normalise the zone-id on parse; `stringifyParsedURL` will
  round-trip a canonical form. See `test/parse.test.ts` — the current
  behaviour is pinned by `keeps IPv6 zone-id inside the hostname verbatim`.

### V2-03. `parseQuery` object prototype

- **Source marker**: `src/query.ts` — `TODO: Use new EmptyObject()`.
- **Current**: `parseQuery` returns an `Object.create(null)` object, which is
  fine for lookup safety but slightly slower to construct than a shared
  no-prototype constructor. See [unjs/ufo#290](https://github.com/unjs/ufo/pull/290).
- **Migration**: perf-only; no visible behaviour change beyond a marginally
  faster allocator.

### V2-04. WHATWG-parity toggle (parseStrictURL)

- **Source marker**: none yet — candidate design.
- **Current**: `parseURL` intentionally deviates from WHATWG in ~65 fixture
  cases (see `EXPECTED_FAILURES` in `test/wpt-urltestdata.test.ts`). The
  deviations are the reason `ufo` exists (looser scheme grammar, dot-segments
  preserved, numeric-host verbatim, etc.).
- **Decision needed**: whether to ship an opt-in `parseStrictURL` that
  matches `new URL()` bit-for-bit. Rejected in the initial audit — the
  platform `URL` already covers that use case. Recorded here so it isn't
  re-audited.

### V2-05. Query-value typing

- **Source marker**: `src/query.ts` — `Record<string, any>` in the
  `QueryValue` union.
- **Current**: `QueryValue` widens to `Record<string, any>` for the
  "structured value" case (arrays / objects run through `JSON.stringify`).
  `any` bypasses type-checks for downstream callers.
- **Migration**: tighten to `Record<string, QueryValue>` (recursive) or
  `unknown`. `any` → `unknown` is a semver-major break because it forces
  callers to narrow before assignment.

