# Plan 021 — DIR-10: `with*` / `without*` symmetry

**Status**: READY_TO_APPLY
**Tag**: [BASELINE]
**Category**: direction (API surface completion)
**Est. effort**: 1 session
**Est. risk**: LOW — pure additions, no signature changes to existing exports.

## Finding

`ufo`'s functional builders have advertised `with X` / `without X` symmetry
for most URL parts, but three slots are asymmetric today:

| Slot | `with*` | `without*` |
|---|---|---|
| protocol | ✅ `withProtocol`, `withHttp`, `withHttps` | ✅ `withoutProtocol` |
| host | ❌ **missing** | ✅ `withoutHost` |
| port | ❌ **missing** | ❌ **missing** |
| auth (userinfo) | ❌ **missing** | ❌ **missing** |
| trailing slash | ✅ | ✅ |
| leading slash | ✅ | ✅ |
| query | ✅ `withQuery` | ✅ `withoutQuery` |
| fragment | ✅ | ✅ |
| base | ✅ | ✅ |

The parsed shape (`parseURL` → `ParsedURL`) already exposes `host`, `auth`,
and the port-inside-host as first-class fields, so every gap is a
"the object supports it, the builder doesn't" mismatch. Users work around
this by round-tripping through `parseURL` + `stringifyParsedURL`, which is
verbose and (before plan 018's `parseHost` anchor fix) sometimes lossy.

## Scope — 4 new exports

Add these four builders to `src/utils/host.ts` (or a new `src/utils/authority.ts`
if the file grows). All are pure additions; no existing signature changes.

### 1. `withHost(input, host)`

Sets or replaces the host authority slot. Preserves `auth`, port, path, search, hash.

```ts
withHost("http://example.com/foo?x=1#h", "other.com");
// → "http://other.com/foo?x=1#h"

withHost("http://user:pw@example.com:8080/x", "new.com");
// → "http://user:pw@new.com:8080/x"    (auth + port preserved)

withHost("/only/path", "example.com");
// → parseURL treats input as relative — result depends on parseURL semantics.
//   Documented behaviour: returns `input` unchanged when the input has no host.
```

**Design decision**: on a relative input (no host slot), do NOT synthesize
a scheme. `withHost` is a *replace* operator, not a *promote-to-absolute*
operator. Callers who want absolute construction should use `joinURL` or
build a `ParsedURL` object directly.

**Type refinement**: not attempted in this plan. Host replacement in the
type system requires matching `${scheme}://${_host}(...rest)` and swapping
`_host` — feasible but low-value for a first-pass symmetry patch. Leave
the return type as `string` and revisit only if a user asks.

### 2. `withPort(input, port)`

Sets or replaces the port slot. Accepts `string | number` for ergonomics.
`""` or `undefined` should be handled by `withoutPort` instead — passing
`0` or `""` here throws `TypeError`.

```ts
withPort("http://example.com/x", 8080); // → "http://example.com:8080/x"
withPort("http://example.com:80/x", 443); // → "http://example.com:443/x"
withPort("/only/path", 8080); // → "/only/path" (no host, no-op)
```

**Validation**: port must be a positive integer (1..65535) or a
digits-only string in the same range. Otherwise throws `TypeError` with
a message pointing to `withoutPort` for the strip case.

### 3. `withoutPort(input)`

Strips the port from an absolute URL. Leaves the rest untouched.

```ts
withoutPort("http://example.com:8080/x"); // → "http://example.com/x"
withoutPort("http://example.com/x"); // → "http://example.com/x"  (no-op)
withoutPort("/relative/path"); // → "/relative/path"  (no-op)
```

### 4. `withoutAuth(input)`

Strips the userinfo (`user:pass@`) prefix from an absolute URL's authority.

```ts
withoutAuth("http://user:pw@example.com/x"); // → "http://example.com/x"
withoutAuth("http://user@example.com/x"); // → "http://example.com/x"
withoutAuth("http://example.com/x"); // → "http://example.com/x" (no-op)
withoutAuth("/relative/path"); // → "/relative/path"       (no-op)
```

**Explicitly out of scope**: `withAuth(input, "user:pw")`. Userinfo is a
security-sensitive slot; setting it via a plain string invites shell
history / logging leaks, and RFC 3986 percent-encoding is not yet applied
on serialisation (see `TODO(v2)` in `parseAuth`). We defer `withAuth` to
v2 where userinfo encoding will be correct.

## Implementation notes

1. **File placement**: extend `src/utils/host.ts` with `withHost`,
   `withPort`, `withoutPort`, `withoutAuth`. Keep `withoutAuth` here (not
   in a new file) since it operates on the same authority slot.

2. **All four builders use the parseURL → mutate → stringifyParsedURL
   pattern.** `parseURL` handles all the edge cases (IPv6 brackets, trailing
   slashes, opaque schemes); reusing it avoids re-implementing the parser.

3. **Fast-paths**: for relative inputs (`hasProtocol(input, {
   acceptRelative: true }) === false` AND input starts with `/`, `?`, or
   `#`), return `input` unchanged instead of round-tripping. Mirror the
   pattern in `withoutHost`.

4. **Exports**: add all 4 names to `src/index.ts` barrel.

5. **Tests**: add per-function `describe` blocks in `test/utilities.test.ts`
   next to the existing `withoutHost` block. Cover:
   - No-op on relative input
   - Idempotency (`f(f(x)) === f(x)`)
   - Round-trip via `parseURL` (`parseURL(f(x)).host` matches expected)
   - IPv6 host preservation
   - Auth preservation (for `withHost`, `withPort`)

6. **No type refinement** (`Refine<S, ...>`) in this plan. The runtime is
   the source of truth; string-transforming type surgery is expensive at
   compile time and low-leverage for authority slots. Revisit if a user
   requests it.

## Verification

- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm vitest run --typecheck` — 968+ passes, 65 xfails unchanged
- [ ] `pnpm lint` — clean
- [ ] `pnpm build` — publishes correct `dist/` shape
- [ ] `pnpm test:package` — attw + publint clean (four new exports must be
      correctly typed in `.d.ts`)

## Non-goals

- Type-level refinement (`Refine<S, ...>`) for the four new exports.
- `withAuth(input, "user:pw")` — deferred to v2 (userinfo encoding fix).
- Deprecating any existing export.
- Any change to `parseURL` / `stringifyParsedURL`.
