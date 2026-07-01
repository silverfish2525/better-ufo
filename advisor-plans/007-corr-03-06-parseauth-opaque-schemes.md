# Plan 007: Fix `parseAuth` colon-truncation and surface opaque-scheme URLs (`mailto:`, `tel:`, `urn:`, `http:foo`) in `parseURL` + `stringifyParsedURL`

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat f06c800..HEAD -- src/parse.ts src/url.ts test/parse.test.ts test/url.test.ts
> ```
>
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — the `parseURL` behavior change on opaque schemes (`mailto:`, `tel:`, `urn:`, etc.)
  is a semantic addition; some consumers may have been checking `parsed.protocol === ""` as an
  "opaque or malformed" signal. `parseAuth` colon fix is a straight bug fix with narrow blast
  radius. `stringifyParsedURL` gains an authority-presence gate.
- **Depends on**: `advisor-plans/001-verification-baseline.md` (adds the `FIXME(CORR-03)` pinned
  test that Step 3 flips), `advisor-plans/004-sec-03-04-whatwg-scheme-authority-parity.md`
  (tightens the scheme regex to alpha-leading and adds `SPECIAL_SCHEMES` / `isSpecialScheme` in
  `src/utils.ts`; this plan reuses both).
- **Category**: bug
- **Planned at**: commit `f06c800`, 2026-07-01
- **Branch**: `advisor/007-parseauth-opaque-schemes`

## Why this matters

Two correctness bugs in `unjs/ufo@1.6.4`, verified at `f06c800` against `dist/index.mjs`:

1. **CORR-03** — `parseAuth("user:pa:ss")` returns `{ username: "user", password: "pa" }`; the
   `":ss"` suffix vanishes. `parseAuth` implements `input.split(":")` and destructures indices
   `[0]` and `[1]`, dropping everything after the second colon. RFC 3986 §3.2.1 says userinfo
   splits on the **first** `:` — the password may itself contain colons because `:` is not a
   sub-delim in the userinfo production. Cascade: `$URL.encodedAuth` calls `parseAuth`, so
   `new $URL("http://user:pa:ss@example.com").href` re-serializes to
   `"http://user:pa@example.com"` — round-trip data loss.

2. **CORR-06** — `parseURL("mailto:a@b.com")` returns
   `{ protocol: "", host: "", auth: "", pathname: "", search: "", hash: "" }` — an entirely empty
   struct. Same for `parseURL("tel:+1-555-1234")`, `parseURL("urn:isbn:0451450523")`,
   `parseURL("http:foo")` (scheme without `//`). Root cause: `parseURL`'s authority regex
   requires `//` after the scheme, and the earlier `hasProtocol(input, { acceptRelative: true })`
   check returns false for schemes without `//`, so control falls into `parsePath(input)` which
   is called with `defaultProto === undefined` and returns `{ pathname: "mailto:a@b.com", ... }`
   — but the outer contract is that the result must have a defined `protocol`, and downstream
   consumers see `""` for both. RFC 3986 §3 defines opaque URIs (`scheme:opaque-part`) as
   first-class URIs; `ufo` currently loses the scheme entirely.

   Bonus, verified: even the four schemes `parseURL` **does** handle via its
   `_specialProtoMatch` branch (`blob:`, `data:`, `javascript:`, `vbscript:`) do **not** round-trip
   through `stringifyParsedURL` — `stringifyParsedURL(parseURL("data:text/plain,x"))` returns
   `"data://text/plain,x"` (spurious `//`). Fixing the general opaque case forces us to fix the
   stringifier too, closing that gap.

After this plan lands: userinfo passwords may contain colons losslessly; opaque-scheme URLs
populate `.protocol` and `.pathname`; and `stringifyParsedURL(parseURL(x)) === x` for every URL
type ufo supports.

## Current state

### Files and their role

- `src/parse.ts` — `parseAuth` (lines 147–153 at `f06c800`), `parseURL` (lines 57–103, including
  the `_specialProtoMatch` early-return branch for `blob:`/`data:`/`javascript:`/`vbscript:` at
  62–77 and the general path at 78–99), and `stringifyParsedURL` (lines 196–208). All three
  change in this plan.
- `src/url.ts` — the `$URL` class (`@deprecated`). Its `password` getter (line 55) and
  `encodedAuth` getter (lines 98–107) both call `parseAuth(this.auth)`; they inherit the fix
  automatically without touching this file. In-scope only if verification proves a getter needs
  adjustment (unlikely — verify in Step 4).
- `test/parse.test.ts` — plan 001 appends a `describe("parseAuth", …)` block with four cases,
  one of which is a `FIXME(CORR-03)` pinning the buggy behavior. Step 3 of this plan flips that
  FIXME. Plan 001 does **not** pin opaque-scheme behavior — Step 5 adds those tests fresh.
- `test/url.test.ts` — no current userinfo/round-trip tests; Step 6 adds them.
- `advisor-plans/README.md` — update this plan's status row when done (row exists at
  `f06c800`; if missing, plan 001 didn't land and this plan STOPs anyway).

### Exact current code — CONFIRM MATCH, do not edit in this section

`src/parse.ts:147-153` — `parseAuth`:

```ts
export function parseAuth(input = ""): ParsedAuth {
  const [username, password] = input.split(":");
  return {
    username: decode(username),
    password: decode(password),
  };
}
```

`src/parse.ts:61-99` — the `parseURL` body, showing the `_specialProtoMatch` early-return
(handles `blob:`, `data:`, `javascript:`, `vbscript:` — but **NOT** `mailto:`, `tel:`, `urn:`,
`http:foo`, etc.) and the general branch that requires `//`:

```ts
export function parseURL(input = "", defaultProto?: string): ParsedURL {
  const _specialProtoMatch = input.match(
    /^[\s\0]*(blob:|data:|javascript:|vbscript:)(.*)/i,
  );
  if (_specialProtoMatch) {
    const [, _proto, _pathname = ""] = _specialProtoMatch;
    return {
      protocol: _proto.toLowerCase(),
      pathname: _pathname,
      href: _proto + _pathname,
      auth: "",
      host: "",
      search: "",
      hash: "",
    };
  }

  if (!hasProtocol(input, { acceptRelative: true })) {
    return defaultProto ? parseURL(defaultProto + input) : parsePath(input);
  }

  const [, protocol = "", auth, hostAndPath = ""]
    = input
      .replace(/\\/g, "/")
      .match(/^[\s\0]*([\w+.-]{2,}:)?\/\/([^/@]+@)?(.*)/) || [];

  let [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)?/) || [];

  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Z]:)/i, "");
  }

  const { pathname, search, hash } = parsePath(path);
  // ...returns { protocol, auth, host, pathname, search, hash, [protocolRelative]: !protocol }
}
```

`src/parse.ts:196-208` — `stringifyParsedURL` (note the unconditional `+ "//"` when `protocol` is
truthy — this is the second thing to fix so that `mailto:a@b.com` round-trips as `mailto:a@b.com`
and not `mailto://a@b.com`):

```ts
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string {
  const pathname = parsed.pathname || "";
  const search = parsed.search
    ? (parsed.search.startsWith("?") ? "" : "?") + parsed.search
    : "";
  const hash = parsed.hash || "";
  const auth = parsed.auth ? `${parsed.auth}@` : "";
  const host = parsed.host || "";
  const proto
    = parsed.protocol || parsed[protocolRelative]
      ? `${parsed.protocol || ""}//`
      : "";
  return proto + auth + host + pathname + search + hash;
}
```

`src/url.ts:49-56` — `$URL.username` / `$URL.password` (verify these inherit the fix; do not
edit unless Step 4 finds a required adjustment):

```ts
  get username(): string {
    return parseAuth(this.auth).username;
  }

  get password(): string {
    return parseAuth(this.auth).password || "";
  }
```

`src/url.ts:98-108` — `$URL.encodedAuth` (called from `href`; will now emit `%3A` for colons in
the password after the fix — this is expected and correct):

```ts
  get encodedAuth(): string {
    if (!this.auth) {
      return "";
    }
    const { username, password } = parseAuth(this.auth);
    return (
      encodeURIComponent(username) +
      (password ? ":" + encodeURIComponent(password) : "")
    );
  }
```

### Runtime facts (verified at `f06c800`, 2026-07-01, against `dist/index.mjs`)

Copy-paste-run to confirm before starting:

```bash
node -e 'import("./dist/index.mjs").then(m => {
  console.log("parseAuth user:pa:ss =", JSON.stringify(m.parseAuth("user:pa:ss")));
  console.log("parseURL mailto:  =", JSON.stringify(m.parseURL("mailto:a@b.com")));
  console.log("parseURL tel:     =", JSON.stringify(m.parseURL("tel:+1-555-1234")));
  console.log("parseURL urn:isbn =", JSON.stringify(m.parseURL("urn:isbn:0451450523")));
  console.log("parseURL http:foo =", JSON.stringify(m.parseURL("http:foo")));
  console.log("parseURL data:    =", JSON.stringify(m.parseURL("data:text/plain,x")));
  console.log("stringify data:   =", JSON.stringify(m.stringifyParsedURL(m.parseURL("data:text/plain,x"))));
  console.log("stringify mailto: =", JSON.stringify(m.stringifyParsedURL(m.parseURL("mailto:a@b.com"))));
  const u = new m.$URL("http://user:pa:ss@example.com/path");
  console.log("$URL href:", u.href, " auth:", u.auth, " password:", u.password);
});'
```

**Expected pre-fix output (must match, else STOP)**:

```
parseAuth user:pa:ss = {"username":"user","password":"pa"}
parseURL mailto:  = {"protocol":"","auth":"","host":"","pathname":"","search":"","hash":""}
parseURL tel:     = {"protocol":"","auth":"","host":"","pathname":"","search":"","hash":""}
parseURL urn:isbn = {"protocol":"","auth":"","host":"","pathname":"","search":"","hash":""}
parseURL http:foo = {"protocol":"","auth":"","host":"","pathname":"","search":"","hash":""}
parseURL data:    = {"protocol":"data:","pathname":"text/plain,x","href":"data:text/plain,x","auth":"","host":"","search":"","hash":""}
stringify data:   = "data://text/plain,x"          # <-- bug: spurious `//`
stringify mailto: = "//"                            # <-- bug: struct was empty, protocol got lost
$URL href: http://user:pa@example.com/path  auth: user:pa:ss  password: pa
```

If any of these do **not** match, treat as a STOP condition — the bug has already been fixed or
the codebase has drifted.

### Design choice — Option A (surface opaque-part as `pathname`)

Two ways to model `parseURL("mailto:a@b.com")`:

- **Option A (chosen)**: `{ protocol: "mailto:", pathname: "a@b.com", host: "", auth: "", search:
  "", hash: "" }`. Same shape as WHATWG `new URL("mailto:a@b.com")` where `.pathname === "a@b.com"`
  in Node/browsers. No new fields; `ParsedURL` type is unchanged; `_types.ts` in-flight work is
  not disturbed.
- **Option B** (rejected here): new `.opaque` field on `ParsedURL`. Semantically nicer
  (matches RFC's `scheme:opaque-part`), but requires a `_types.ts` shape change — the in-flight
  overloads work would need to update, and consumers relying on `ParsedURL`'s structural type
  would see a new required-shaped field. Deferred to v2. See "Maintenance notes".

**This plan implements Option A.** If for any reason you find yourself needing to add an `.opaque`
field, STOP — that's a v2-scope change that must go through direction plan D2 (finalize
`_types.ts`), not this plan.

### Conventions

- Zero deps. No new imports.
- Named exports only; no default export.
- `describe(…) { for (const t of tests) it(…) }` table-driven test shape — match
  `test/parse.test.ts:4-183` `describe("parseURL", ...)` for structure.
- Conventional commits: `fix(parseAuth): …`, `fix(parseURL): …`, `fix(stringifyParsedURL): …`.
  Multiple small commits preferred over one large one.
- No `console.log`, no dead code, no `TODO` without an owner (use `TODO(v2): …` per this plan).

## Commands you will need

| Purpose        | Command                              | Expected on success                     |
| -------------- | ------------------------------------ | --------------------------------------- |
| Install        | `pnpm install`                       | exit 0                                  |
| Tests          | `pnpm test`                          | all pass (509 baseline + plan 001 adds + plan 004 adds + new) |
| Tests (filter) | `pnpm vitest run test/parse.test.ts` | all pass                                |
| Tests (filter) | `pnpm vitest run test/url.test.ts`   | all pass                                |
| Build          | `pnpm build`                         | exit 0                                  |
| Lint           | `pnpm lint`                          | exit 0                                  |
| Runtime probe  | `node -e 'import(...)'` (see above)  | pre/post-fix strings                    |

## Suggested executor toolkit

- No specialized skills required. If you have `hunk-review` available and want a diff-review pass
  before commit, that's optional — the changes are small.
- Reference: `.agents/skills/improve/references/plan-template.md` — this plan's structural
  ancestor; useful if you need to interpret an ambiguous field name.

## Scope

**In scope** (the only files you may modify):

- `src/parse.ts` — `parseAuth` rewrite, `parseURL` opaque-scheme branch, `stringifyParsedURL`
  authority-presence gate.
- `test/parse.test.ts` — flip `FIXME(CORR-03)` pinned test; add `describe` for opaque schemes.
- `test/url.test.ts` — new round-trip test with multi-colon userinfo.

**Possibly in scope, verify first** (Step 4):

- `src/url.ts` — `$URL.password` / `$URL.encodedAuth` — probably no change needed; the fix
  in `parseAuth` propagates automatically. Only touch if a Step 4 verification proves otherwise.

**Out of scope** (do NOT touch, even though they look related):

- `src/_types.ts` — the in-flight `ParseURL` / overload work must not be disturbed. Option A
  requires no shape change. If you find yourself opening this file, STOP.
- `src/utils.ts` — plan 004 owns changes here. If plan 004 has landed, the file already contains
  `SPECIAL_SCHEMES` and `isSpecialScheme`; do not add to them.
- Percent-encoding rules for userinfo beyond what's already there — deferred; leave a
  `TODO(v2): percent-encode userinfo per RFC 3986 §3.2.1` comment near `parseAuth` if there
  isn't already one.
- Full IRI / IDN / Unicode-scheme support — out.
- `$URL` deprecation cleanup — separate direction plan.
- CORR-01 (IPv6) — plan 005.
- CORR-02/04 (base + fragment) — plan 006.

## Git workflow

- Branch: `advisor/007-parseauth-opaque-schemes` (create if it doesn't exist).
  ```bash
  git switch -c advisor/007-parseauth-opaque-schemes
  ```
- Do NOT stash or touch the existing uncommitted `_types.ts` in-flight work; leave it in the
  working tree. Verify presence in Step 0.
- Conventional commits. Suggested commit boundaries:
  1. `fix(parseAuth): split userinfo on the first colon only (RFC 3986 §3.2.1)`
  2. `fix(parseURL): surface opaque-scheme URIs (mailto:, tel:, urn:, http:foo) via .pathname`
  3. `fix(stringifyParsedURL): omit "//" when there is no authority (host + protocolRelative both empty)`
  4. `test(parseAuth): flip FIXME(CORR-03) — password now retains interior colons`
  5. `test(parseURL): add opaque-scheme coverage and stringify round-trip`
  6. `test(url): pin $URL multi-colon userinfo round-trip`
- Do NOT push or open a PR unless the operator instructs it.

---

## Steps

### Step 0: Baseline + dependency-gate verification (STOP gate)

Run in order:

```bash
git rev-parse HEAD
pnpm install
pnpm test
```

**Expected**: on a tree with plans 001–006 landed, `pnpm test` passes (509 baseline + 001-adds +
004-adds + 005/006 adds). Note the exact test count in your report. If **any** test fails, STOP.

Verify plan 004 has landed (this plan reuses its `SPECIAL_SCHEMES` and its tightened scheme regex):

```bash
grep -n "SPECIAL_SCHEMES\|isSpecialScheme" src/utils.ts
grep -n "\[A-Za-z\]\[A-Za-z0-9+\\.\\\\-\]" src/utils.ts
```

**Expected**: at least one `SPECIAL_SCHEMES` **and** one `isSpecialScheme` hit in `src/utils.ts`,
plus the alpha-leading scheme character-class in the same file. If either is missing, **STOP** —
plan 004 is a hard dependency (see rationale in "Depends on" and "Why this matters").

Verify plan 001 has landed (this plan flips its `FIXME(CORR-03)` marker):

```bash
grep -n 'FIXME(CORR-03)' test/parse.test.ts
grep -n 'describe("parseAuth"' test/parse.test.ts
```

**Expected**: exactly **1** `FIXME(CORR-03)` hit and exactly **1** `describe("parseAuth"` hit.
If either is missing or the count differs, STOP — plan 001 is the source of the pinned test that
Step 3 flips.

Verify current buggy behavior — run the runtime probe from "Current state → Runtime facts" and
match it line-by-line. Any mismatch → STOP.

Verify the working-tree in-flight type work is present (per repo-wide standing rule):

```bash
git status --short src/_types.ts test/types.test-d.ts
```

**Expected**: uncommitted changes still present (or files exist and are unmodified — either is
fine; what's NOT fine is that `_types.ts` is missing or has been reverted). If `_types.ts` is
missing, STOP.

### Step 1: Fix `parseAuth` (CORR-03) in `src/parse.ts`

Replace the `parseAuth` function body at `src/parse.ts:147-153`. Change:

```ts
export function parseAuth(input = ""): ParsedAuth {
  const [username, password] = input.split(":");
  return {
    username: decode(username),
    password: decode(password),
  };
}
```

to:

```ts
export function parseAuth(input = ""): ParsedAuth {
  // RFC 3986 §3.2.1: userinfo = *( unreserved / pct-encoded / sub-delims / ":" )
  // The FIRST ":" splits username from password; subsequent colons are part of the password.
  // Percent-decoding follows via `decode(...)`.
  // TODO(v2): percent-encode userinfo per RFC 3986 §3.2.1 (mirrored on serialization side).
  const firstColon = input.indexOf(":");
  if (firstColon === -1) {
    return {
      username: decode(input),
      password: "",
    };
  }
  return {
    username: decode(input.slice(0, firstColon)),
    password: decode(input.slice(firstColon + 1)),
  };
}
```

Notes:

- Preserve the existing `decode(...)` calls on both fields — percent-decoding is unchanged.
- The empty-string case naturally returns `{ username: "", password: "" }` because
  `input.indexOf(":") === -1` and `decode("") === ""`.
- The `:pw` (leading colon, no username) case returns `{ username: "", password: "pw" }` because
  `firstColon === 0`, `slice(0, 0) === ""`, `slice(1) === "pw"`.
- Do not change the exported signature or the `ParsedAuth` interface.

**Verify** — the plan-001 pinned `FIXME(CORR-03)` test now fails (that's the whole point; Step 3
flips it), but nothing else regresses:

```bash
pnpm vitest run test/parse.test.ts 2>&1 | tail -25
```

**Expected**: exactly **1** failure — the `FIXME(CORR-03)` case in `describe("parseAuth", …)`,
now returning `{ username: "user", password: "pa:ss" }` instead of the pinned buggy `{ username:
"user", password: "pa" }`. All other cases (including the three positive `parseAuth` cases plan
001 added) still pass.

If **more than one** test fails, STOP — an unrelated dependency exists that this plan didn't
predict.

Commit: `fix(parseAuth): split userinfo on the first colon only (RFC 3986 §3.2.1)`.

### Step 2: Surface opaque-scheme URIs in `parseURL` (CORR-06) in `src/parse.ts`

Goal: when `parseURL` receives an input whose scheme is followed **directly by `:`** and **not by
`//`** (e.g. `mailto:a@b.com`, `tel:+1-555-1234`, `urn:isbn:0451450523`, `http:foo`), return
`{ protocol: "<scheme>:", pathname: "<opaque-part>", host: "", auth: "", search: "", hash: "" }`
after peeling off any `?query` and `#fragment`.

Locate the `parseURL` body at `src/parse.ts:61-99`. Immediately **after** the existing
`_specialProtoMatch` block (which handles `blob:`, `data:`, `javascript:`, `vbscript:` — leave
untouched) and **before** the `if (!hasProtocol(input, { acceptRelative: true }))` fall-through,
insert a new branch that catches opaque-scheme inputs:

```ts
// CORR-06: opaque-scheme URIs — `scheme:` NOT followed by `//` (RFC 3986 §3).
// Handles `mailto:a@b.com`, `tel:+1-555-1234`, `urn:isbn:...`, `http:foo`, `sms:...`, etc.
// Requires plan 004's tightened alpha-leading scheme class (`[A-Za-z][A-Za-z0-9+.\-]*`)
// to correctly distinguish schemes from path segments containing a colon (e.g. `foo:bar`
// where `foo` is not a valid scheme's first char? — actually `foo` IS a valid scheme;
// this is the exact input `http:foo` — see disambiguation below).
//
// Disambiguation: a bare `foo:bar` string IS a valid opaque URI in RFC 3986. The only
// reason we don't accept `123:bar` is that plan 004's regex rejects digit-leading schemes.
const _opaqueMatch = input.match(
  /^[\s\0]*([A-Z][A-Z0-9+.\-]*:)(?!\/\/)(.*)/i,
);
if (_opaqueMatch) {
  const [, _proto, _rest = ""] = _opaqueMatch;
  // The opaque part still admits `?query` and `#fragment` per RFC 3986 §3 (`opaque-part`
  // is `uric_no_slash *uric`; ufo treats them the same as the hierarchical case).
  const { pathname, search, hash } = parsePath(_rest);
  return {
    protocol: _proto.toLowerCase(),
    auth: "",
    host: "",
    pathname,
    search,
    hash,
  };
}
```

Notes:

- The `(?!\/\/)` negative lookahead is the load-bearing character: it ensures we only take this
  branch for schemes that are **NOT** followed by `//`. The hierarchical branch below continues
  to handle `http://foo`, `https://x`, etc.
- The `blob:`/`data:`/`javascript:`/`vbscript:` cases hit `_specialProtoMatch` earlier and never
  reach here — Step 3 (of Plan 004) already ensures those return their existing shape. We do
  **not** unify those into this branch, because their existing branch also computes a `.href`
  field for legacy consumers.
- If plan 004's scheme regex has landed with a slightly different character class than
  `[A-Za-z][A-Za-z0-9+.\-]*`, **use plan 004's exact class here** — do not diverge. Find it
  with `grep -n "A-Za-z" src/utils.ts`.
- The `[\s\0]*` prelude tolerates leading whitespace / NUL bytes for consistency with the other
  branches; plan 002's `SCHEME_STRIP_RE` normalizes those upstream in `hasProtocol`, so this is
  a defense-in-depth alignment, not a behavior change.
- Do **NOT** set `[protocolRelative]: true` — opaque URIs are absolute; the `//`-less form is
  not "protocol-relative" in the WHATWG sense.

**Verify** — the runtime probe now returns non-empty structs for opaque schemes; existing tests
still pass:

```bash
pnpm build
node -e 'import("./dist/index.mjs").then(m => {
  console.log("mailto:", JSON.stringify(m.parseURL("mailto:a@b.com")));
  console.log("tel:",    JSON.stringify(m.parseURL("tel:+1-555-1234")));
  console.log("urn:",    JSON.stringify(m.parseURL("urn:isbn:0451450523")));
  console.log("http:foo:", JSON.stringify(m.parseURL("http:foo")));
  console.log("http://foo:", JSON.stringify(m.parseURL("http://foo")));   // regression control
  console.log("data:", JSON.stringify(m.parseURL("data:text/plain,x")));  // regression control
})'
```

**Expected**:

```
mailto: {"protocol":"mailto:","auth":"","host":"","pathname":"a@b.com","search":"","hash":""}
tel:    {"protocol":"tel:","auth":"","host":"","pathname":"+1-555-1234","search":"","hash":""}
urn:    {"protocol":"urn:","auth":"","host":"","pathname":"isbn:0451450523","search":"","hash":""}
http:foo: {"protocol":"http:","auth":"","host":"","pathname":"foo","search":"","hash":""}
http://foo: {"protocol":"http:","auth":"","host":"foo","pathname":"","search":"","hash":"","...":true}
data: {"protocol":"data:","pathname":"text/plain,x","href":"data:text/plain,x","auth":"","host":"","search":"","hash":""}
```

Then re-run the suite:

```bash
pnpm test
```

**Expected**: all tests still pass. If any existing test regresses on `http://…`, `https://…`,
`file:…`, or the four `_specialProtoMatch` schemes, STOP — the lookahead is not doing what you
think it is.

Commit: `fix(parseURL): surface opaque-scheme URIs (mailto:, tel:, urn:, http:foo) via .pathname`.

### Step 3: Fix `stringifyParsedURL` authority gating in `src/parse.ts`

Without this fix, `stringifyParsedURL(parseURL("mailto:a@b.com"))` returns `"mailto://a@b.com"`
(and today, before this plan even runs, `stringifyParsedURL(parseURL("data:text/plain,x"))`
returns `"data://text/plain,x"` — a preexisting round-trip bug). The fix: only emit the `//`
authority separator when there is actually an authority (i.e., a `host`, or the parsed URL is
explicitly protocol-relative).

Locate `stringifyParsedURL` at `src/parse.ts:196-208`. Change:

```ts
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string {
  const pathname = parsed.pathname || "";
  const search = parsed.search
    ? (parsed.search.startsWith("?") ? "" : "?") + parsed.search
    : "";
  const hash = parsed.hash || "";
  const auth = parsed.auth ? `${parsed.auth}@` : "";
  const host = parsed.host || "";
  const proto
    = parsed.protocol || parsed[protocolRelative]
      ? `${parsed.protocol || ""}//`
      : "";
  return proto + auth + host + pathname + search + hash;
}
```

to:

```ts
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string {
  const pathname = parsed.pathname || "";
  const search = parsed.search
    ? (parsed.search.startsWith("?") ? "" : "?") + parsed.search
    : "";
  const hash = parsed.hash || "";
  const auth = parsed.auth ? `${parsed.auth}@` : "";
  const host = parsed.host || "";
  // Emit the "//" authority separator ONLY when an authority exists (host present, or
  // any userinfo, or protocol-relative). Opaque URIs (mailto:, tel:, urn:, data:, javascript:,
  // http:foo) have `protocol` set but no host and no protocolRelative flag — they must
  // serialize as `scheme:opaque-part`, NOT `scheme://opaque-part`.
  const hasAuthority = Boolean(host) || Boolean(auth) || Boolean(parsed[protocolRelative]);
  const proto = parsed.protocol
    ? parsed.protocol + (hasAuthority ? "//" : "")
    : parsed[protocolRelative]
      ? "//"
      : "";
  return proto + auth + host + pathname + search + hash;
}
```

Notes:

- Rationale: WHATWG serialization for `mailto:a@b.com` is `mailto:a@b.com` (no `//`); for
  `http://a` it is `http://a` (with `//`). The discriminant is the presence of an authority, not
  the presence of a scheme. The current code conflates the two.
- `auth` presence is included in `hasAuthority` because a `Partial<ParsedURL>` with only
  `{ protocol: "http:", auth: "u:p" }` and no host is nonsensical but shouldn't collapse into an
  opaque form silently — keeping `//` here matches the WHATWG serializer.
- The `protocolRelative: true` case (input like `//example.com/x`) continues to emit `//` as before,
  via the `else if` branch.

**Verify** — round-trip both opaque and hierarchical URLs:

```bash
pnpm build
node -e 'import("./dist/index.mjs").then(m => {
  const cases = [
    "mailto:a@b.com",
    "tel:+1-555-1234",
    "urn:isbn:0451450523",
    "http:foo",
    "data:text/plain,x",
    "http://foo.com/x?q=1#h",
    "https://user:pw@host:8080/p?q#h",
    "//example.com/x",         // protocol-relative
    "/absolute/path",           // no scheme, no authority
    "relative/path",            // no scheme, no authority
  ];
  for (const c of cases) {
    const round = m.stringifyParsedURL(m.parseURL(c));
    console.log(round === c ? "OK  " : "FAIL", JSON.stringify(c), "=>", JSON.stringify(round));
  }
})'
```

**Expected**: every line prints `OK`. Special cases:

- `data:text/plain,x` was previously round-tripping as `data://text/plain,x` — this fix corrects
  it. Consider this a bonus fix; the `data:` case has no assertion in the current test suite so
  no test breaks, but Step 5 adds one.
- `//example.com/x` continues to round-trip with the leading `//` (protocol-relative case).

If any line prints `FAIL`, fix before proceeding. Then:

```bash
pnpm test
```

**Expected**: all tests still pass. Watch for `withBase` / `joinURL` tests that internally call
`stringifyParsedURL` — none should regress, because the `//`-gating only changes behavior when
there is no host and no `protocolRelative`, which those tests do not exercise for `http:/https:`
URLs.

Commit: `fix(stringifyParsedURL): omit "//" when there is no authority (host + protocolRelative both empty)`.

### Step 4: Verify `$URL` inherits the `parseAuth` fix (may be no-op)

`$URL.password` reads `parseAuth(this.auth).password`. `$URL.encodedAuth` also calls `parseAuth`.
After Step 1, `password` returns the correct multi-colon value; `encodedAuth` percent-encodes
each colon in the password via `encodeURIComponent(password)`, which turns `:` into `%3A`.

Verify — no source change should be needed:

```bash
pnpm build
node -e 'import("./dist/index.mjs").then(m => {
  const u = new m.$URL("http://user:pa:ss@example.com/path");
  console.log("auth:",     u.auth);
  console.log("username:", u.username);
  console.log("password:", u.password);
  console.log("encodedAuth:", u.encodedAuth);
  console.log("href:",     u.href);
})'
```

**Expected**:

```
auth: user:pa:ss
username: user
password: pa:ss
encodedAuth: user:pa%3Ass
href: http://user:pa%3Ass@example.com/path
```

If `password` is `"pa:ss"` and `encodedAuth` is `"user:pa%3Ass"` and `href` is
`"http://user:pa%3Ass@example.com/path"`, **do NOT touch `src/url.ts`** — the fix propagates as
expected. Skip to Step 5.

If any of the three is wrong (e.g. `password` still `"pa"` or `href` truncated), STOP and
investigate — it means either Step 1 was reverted, or the `$URL` constructor is not calling into
the exported `parseAuth`. Do not silently patch `$URL` — file a report.

### Step 5: Flip `FIXME(CORR-03)` and add opaque-scheme tests in `test/parse.test.ts`

Edit `test/parse.test.ts`.

**5a — Flip the pinned FIXME added by plan 001.** Locate the block:

```ts
// FIXME(CORR-03): plan 007 changes this to
//   { username: "user", password: "pa:ss" }
// Today parseAuth splits on the FIRST ":" and drops the rest ("ss").
// See src/parse.ts. When plan 007 lands, update this expected value
// and remove this FIXME.
it("currently drops content after the second colon (buggy — see FIXME)", () => {
  expect(parseAuth("user:pa:ss")).toStrictEqual({
    username: "user",
    password: "pa",
  });
});
```

Replace it with the correct-behavior assertion (drop the FIXME comment; add a leading-colon
control case and a trailing-colon control case while you're there):

```ts
it("preserves colons in the password (RFC 3986 §3.2.1 — first colon splits)", () => {
  expect(parseAuth("user:pa:ss")).toStrictEqual({
    username: "user",
    password: "pa:ss",
  });
});

it("handles a leading colon (empty username, non-empty password)", () => {
  expect(parseAuth(":pw")).toStrictEqual({
    username: "",
    password: "pw",
  });
});

it("handles a trailing colon (username, empty password)", () => {
  expect(parseAuth("user:")).toStrictEqual({
    username: "user",
    password: "",
  });
});

it("handles multiple consecutive colons in the password", () => {
  expect(parseAuth("u::::p")).toStrictEqual({
    username: "u",
    password: ":::p",
  });
});
```

**5b — Add opaque-scheme tests.** Append a new `describe` block at the end of
`describe("parseURL", …)` (before its closing `});`):

```ts
describe("CORR-06: opaque-scheme URIs (mailto:, tel:, urn:, http:foo, sms:)", () => {
  // RFC 3986 §3: `scheme:opaque-part`. ufo surfaces opaque-part as `pathname` (Option A;
  // matches WHATWG `new URL("mailto:...").pathname`).
  it("populates protocol and pathname for mailto:", () => {
    expect(parseURL("mailto:a@b.com")).toMatchObject({
      protocol: "mailto:",
      auth: "",
      host: "",
      pathname: "a@b.com",
      search: "",
      hash: "",
    });
  });

  it("populates protocol and pathname for tel:", () => {
    expect(parseURL("tel:+1-555-1234")).toMatchObject({
      protocol: "tel:",
      auth: "",
      host: "",
      pathname: "+1-555-1234",
      search: "",
      hash: "",
    });
  });

  it("populates protocol and pathname for urn: (opaque-part may contain colons)", () => {
    expect(parseURL("urn:isbn:0451450523")).toMatchObject({
      protocol: "urn:",
      auth: "",
      host: "",
      pathname: "isbn:0451450523",
      search: "",
      hash: "",
    });
  });

  it("populates protocol and pathname for sms:", () => {
    expect(parseURL("sms:+15551234")).toMatchObject({
      protocol: "sms:",
      auth: "",
      host: "",
      pathname: "+15551234",
      search: "",
      hash: "",
    });
  });

  it("treats scheme-without-slash as opaque (http:foo)", () => {
    expect(parseURL("http:foo")).toMatchObject({
      protocol: "http:",
      auth: "",
      host: "",
      pathname: "foo",
      search: "",
      hash: "",
    });
  });

  it("splits query and fragment from opaque-part when present", () => {
    expect(parseURL("mailto:a@b.com?subject=hi#frag")).toMatchObject({
      protocol: "mailto:",
      auth: "",
      host: "",
      pathname: "a@b.com",
      search: "?subject=hi",
      hash: "#frag",
    });
  });

  // Regression control: hierarchical URLs still parse the same way (host branch, not opaque).
  it("regression: http://foo still hits the hierarchical branch (host = 'foo')", () => {
    expect(parseURL("http://foo")).toMatchObject({
      protocol: "http:",
      auth: "",
      host: "foo",
      pathname: "",
    });
  });

  // Regression control: `_specialProtoMatch` schemes still use their own branch (with .href).
  it("regression: data: still uses the special branch and includes .href", () => {
    const r = parseURL("data:text/plain,x");
    expect(r.protocol).toBe("data:");
    expect(r.pathname).toBe("text/plain,x");
    // The special branch attaches `.href`; the opaque branch does not.
    expect(r.href).toBe("data:text/plain,x");
  });

  // Round-trip: stringifyParsedURL(parseURL(x)) === x for every opaque URL.
  for (const url of [
    "mailto:a@b.com",
    "tel:+1-555-1234",
    "urn:isbn:0451450523",
    "sms:+15551234",
    "http:foo",
    "data:text/plain,x",
    "mailto:a@b.com?subject=hi#frag",
  ]) {
    it(`round-trip: stringifyParsedURL(parseURL(${JSON.stringify(url)})) === input`, () => {
      expect(stringifyParsedURL(parseURL(url))).toBe(url);
    });
  }
});
```

**Import**: `stringifyParsedURL` must be imported at the top of `test/parse.test.ts`. Locate the
existing top-of-file import:

```ts
import { parseFilename, parseHost, parseURL } from "../src";
```

(Plan 001 will have added `parseAuth` here.) Extend it in-place to:

```ts
import { parseAuth, parseFilename, parseHost, parseURL, stringifyParsedURL } from "../src";
```

Do **not** add a second `import { ... } from "../src"` line — extend the existing one.

**Verify**:

```bash
pnpm vitest run test/parse.test.ts 2>&1 | tail -25
```

**Expected**: all `parseAuth` tests pass (including the flipped one and the three new colon-edge
cases). All new opaque-scheme tests pass. Total test-count delta for `test/parse.test.ts`:
+10 to +12 (flip 1, add 3 parseAuth edge cases, add ~8 opaque-scheme cases including 7 round-trips).

If **any** test in the file fails, STOP and re-inspect the fix.

Commit boundaries (two commits recommended):

1. `test(parseAuth): flip FIXME(CORR-03) — password now retains interior colons`
2. `test(parseURL): add opaque-scheme coverage and stringify round-trip`

### Step 6: Add `$URL` multi-colon round-trip test in `test/url.test.ts`

Edit `test/url.test.ts`. Inside the existing `describe("$URL", ...)` block, add:

```ts
test("preserves multi-colon userinfo password and percent-encodes on serialization", () => {
  const u = new $URL("http://user:pa:ss@example.com/path");
  expect(u.auth).toBe("user:pa:ss");
  expect(u.username).toBe("user");
  expect(u.password).toBe("pa:ss");
  expect(u.encodedAuth).toBe("user:pa%3Ass");
  // Serialization percent-encodes the colon in the password — this is expected and
  // matches WHATWG (`new URL("http://user:pa:ss@example.com").href` === same).
  expect(u.href).toBe("http://user:pa%3Ass@example.com/path");
});

test("regression: single-colon userinfo unchanged", () => {
  const u = new $URL("http://user:pass@example.com/path");
  expect(u.username).toBe("user");
  expect(u.password).toBe("pass");
  expect(u.href).toBe("http://user:pass@example.com/path");
});
```

**Verify**:

```bash
pnpm vitest run test/url.test.ts 2>&1 | tail -20
```

**Expected**: 2 new tests pass; all existing `$URL` tests still pass.

Commit: `test(url): pin $URL multi-colon userinfo round-trip`.

### Step 7: Final full-suite gate

```bash
pnpm lint
pnpm test
pnpm build
```

**Expected**: all three exit 0. Note the final test count in your report.

### Step 8: Update `advisor-plans/README.md`

If `advisor-plans/README.md` exists, update this plan's row to `DONE`:

```bash
grep -n "^| 007 " advisor-plans/README.md
```

Change the `Status` cell from `TODO` to `DONE` on that row. Do not touch other rows.

If the file does not exist, skip — the operator maintains the index.

**Verify**:

```bash
test -f advisor-plans/README.md && grep -n "^| 007" advisor-plans/README.md
```

**Expected**: either "file not found" (skipped) or the row ending in `DONE`.

---

## Test plan

New tests (all in `test/parse.test.ts` unless noted):

**`parseAuth`** — flip plan-001's `FIXME(CORR-03)` and add colon-edge coverage:

- `parseAuth("user:pa:ss")` → `{ username: "user", password: "pa:ss" }` (flip)
- `parseAuth(":pw")` → `{ username: "", password: "pw" }` (new)
- `parseAuth("user:")` → `{ username: "user", password: "" }` (new)
- `parseAuth("u::::p")` → `{ username: "u", password: ":::p" }` (new)
- Existing plan-001 cases (`"user:pass"`, `"user"`, `""`) — unchanged, must still pass.

**`parseURL`** opaque schemes — new `describe` block:

- `parseURL("mailto:a@b.com")` → `{ protocol: "mailto:", pathname: "a@b.com", host: "", auth: "", search: "", hash: "" }`
- `parseURL("tel:+1-555-1234")` → analogous
- `parseURL("urn:isbn:0451450523")` → `{ protocol: "urn:", pathname: "isbn:0451450523", ... }` (colon in opaque-part preserved)
- `parseURL("sms:+15551234")` → analogous
- `parseURL("http:foo")` → `{ protocol: "http:", pathname: "foo", host: "", ... }`
- `parseURL("mailto:a@b.com?subject=hi#frag")` → query and fragment split off cleanly
- **Regression control 1**: `parseURL("http://foo")` still hits hierarchical branch (`host === "foo"`)
- **Regression control 2**: `parseURL("data:text/plain,x")` still uses `_specialProtoMatch` and carries `.href`

**Round-trip** — `stringifyParsedURL(parseURL(x)) === x` for:

- `"mailto:a@b.com"`
- `"tel:+1-555-1234"`
- `"urn:isbn:0451450523"`
- `"sms:+15551234"`
- `"http:foo"`
- `"data:text/plain,x"` (this preexisting bug is fixed as a bonus in Step 3)
- `"mailto:a@b.com?subject=hi#frag"`

**`$URL`** multi-colon userinfo — in `test/url.test.ts`:

- `new $URL("http://user:pa:ss@example.com/path").password === "pa:ss"`
- `new $URL("http://user:pa:ss@example.com/path").href === "http://user:pa%3Ass@example.com/path"`
  (percent-encoding is expected and matches WHATWG)
- **Regression control**: `new $URL("http://user:pass@example.com/path")` — unchanged href.

**Non-regression**: the full existing suite (509 baseline + plan 001 additions + plan 004 additions
+ plans 005/006 additions where landed) must continue to pass unchanged. Any regression outside
the flipped `FIXME(CORR-03)` case is a STOP condition.

Verification: `pnpm test` → all pass, including 15–18 new cases across `test/parse.test.ts` and
`test/url.test.ts` (depending on how many round-trip URLs you include).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm install` exits 0
- [ ] `pnpm test` exits 0; all baseline tests + plan-001 additions + plan-004 additions + this plan's new tests pass
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0
- [ ] `grep -n 'input\.split(":")' src/parse.ts` → 0 matches (old buggy `parseAuth` gone)
- [ ] `grep -n 'firstColon' src/parse.ts` → ≥ 1 match (new `parseAuth` present)
- [ ] `grep -n 'FIXME(CORR-03)' test/parse.test.ts` → 0 matches (pinned FIXME flipped and removed)
- [ ] `grep -n 'CORR-06' test/parse.test.ts` → ≥ 1 match (new opaque-scheme describe block present)
- [ ] `grep -n 'hasAuthority' src/parse.ts` → ≥ 1 match (`stringifyParsedURL` gate present)
- [ ] Runtime check: `parseURL("mailto:a@b.com").pathname === "a@b.com"` and `.protocol === "mailto:"`
- [ ] Runtime check: `parseAuth("user:pa:ss").password === "pa:ss"`
- [ ] Runtime check: `stringifyParsedURL(parseURL("mailto:a@b.com")) === "mailto:a@b.com"`
- [ ] Runtime check: `stringifyParsedURL(parseURL("data:text/plain,x")) === "data:text/plain,x"`
- [ ] Only files inside the in-scope list are modified (`git status` shows nothing else beyond
      the pre-existing in-flight `_types.ts` / overloads work, which must remain untouched)
- [ ] `advisor-plans/README.md` status row for plan 007 flipped to `DONE` (or file absent → skipped)

## STOP conditions

Stop and report back (do not improvise) if:

- **Plan 004 has not landed**: `grep -n "SPECIAL_SCHEMES\|isSpecialScheme" src/utils.ts` returns
  nothing. Do NOT introduce these helpers here — they are 004's contract. (Workaround the plan
  brief mentioned — landing `parseAuth` alone while punting CORR-06 — is not implemented; both
  fixes ship together per the plan-order decision. If the operator wants a partial land, ask.)
- **Plan 001 has not landed**: no `FIXME(CORR-03)` in `test/parse.test.ts`, or no
  `describe("parseAuth", …)` block. Step 3 depends on that block existing.
- **`parseAuth` has already been rewritten**: `grep -n 'input\.split(":")' src/parse.ts` finds
  nothing, or the function body diverges from the "Current state" excerpt.
- **`parseURL` scheme handling has already been rewritten** (beyond plan 004's expected changes):
  the `_specialProtoMatch` branch is gone, or the hierarchical regex has moved substantially.
- **`parseURL("mailto:a@b.com")` already returns a non-empty struct** at Step 0's runtime probe —
  someone already fixed CORR-06; verify against the "Current state → Runtime facts" section and
  reconcile before continuing.
- **Working-tree in-flight files missing**: `src/_types.ts` or `test/types.test-d.ts` is absent.
- **Step 4 finds `$URL.password` still returns `"pa"`** after Step 1 — investigate; do not patch
  `src/url.ts` blindly.
- **`stringifyParsedURL` round-trip fails for `http://foo.com/x?q=1#h`** after Step 3 — the
  authority-presence gate is over-tightened; revisit.
- **Any Done-criteria runtime check** produces a value other than the expected one after all
  steps and one reasonable fix attempt.
- **A fix appears to require touching an out-of-scope file** — especially `src/_types.ts` or
  `src/utils.ts`. Option B (`.opaque` field on `ParsedURL`) is the classic trigger for this;
  refuse it and STOP.

## Maintenance notes

For the human/agent who owns this code after the change lands.

### Behavior changes (call out in CHANGELOG as `fix`)

- `parseAuth("user:pa:ss")` → `{ username: "user", password: "pa:ss" }` (was
  `{ ..., password: "pa" }`). Downstream consumers reconstructing userinfo strings from the
  returned object no longer lose data.
- `parseURL("mailto:a@b.com")` → `{ protocol: "mailto:", pathname: "a@b.com", host: "", ... }`
  (was all-empty). Same for `tel:`, `urn:`, `sms:`, `http:foo`, and any alpha-leading scheme
  without `//`. Consumers that were using `parsed.protocol === ""` as an "opaque / malformed"
  signal must switch to a more precise check, e.g. `parsed.host === ""
  && !parsed.pathname.startsWith("/")`, or simply check the scheme they care about.
- `stringifyParsedURL(x)` no longer inserts a spurious `//` after the scheme when there is no
  authority (`host` empty and `[protocolRelative]` falsy). This fixes:
  - Every opaque URL that previously round-tripped as `scheme://opaque-part`.
  - The preexisting `data:text/plain,x` → `data://text/plain,x` bug that no test caught before.

### What a reviewer should scrutinize

- The `(?!\/\/)` negative-lookahead in the new `_opaqueMatch` regex — verify it does not
  accidentally consume `http://` inputs. The regression-control tests in Step 5 pin this.
- That the character class used in `_opaqueMatch` **matches exactly** the class used in plan
  004's tightened scheme regex in `src/utils.ts` (`[A-Za-z][A-Za-z0-9+.\-]*`). Divergence here
  is a latent bug (`hasProtocol` and `parseURL` would disagree on scheme validity).
- The `hasAuthority` gate in `stringifyParsedURL`: confirm `//example.com` (protocol-relative
  input) still round-trips through the `[protocolRelative]` symbol branch.
- Whether `$URL`'s `.href` percent-encoding of `:` in passwords is intentional (it is — matches
  WHATWG). Downstream Nuxt/Nitro tests may pin the old truncating behavior; sweep with
  `rg -n 'user:pa|pa:ss|"pa"' node_modules/@nuxt/**/*` before releasing if worried.

### Follow-ups explicitly deferred out of this plan

- **Option B** — introduce an explicit `.opaque` field on `ParsedURL`. Requires `_types.ts`
  shape change and overload updates; ship in v2 when semver allows. Direction plan D2 owns it.
- **Percent-encoding rules for userinfo** — currently `parseAuth` only decodes; serialization in
  `$URL.encodedAuth` uses `encodeURIComponent` (percent-encodes too aggressively for the
  userinfo production, which allows `!$&'()*+,;=`). Marked with a `TODO(v2): percent-encode
  userinfo per RFC 3986 §3.2.1` comment near `parseAuth`.
- **Full IRI / IDN support** — direction item; out of scope.
- **First-class `data:` / `blob:` MIME parsing** — the `_specialProtoMatch` branch's `.href`
  field is a legacy hack; folding those schemes into the general opaque branch and dropping
  `.href` is a separate direction item.
- **`stringifyParsedURL` for hierarchical URLs without host** (`http://` with empty host) — this
  is malformed per WHATWG; we treat it as opaque today. If a user reports this as a regression,
  reconsider the `hasAuthority` gate to include `parsed.protocol && isSpecialScheme(...)`.

### Single source of truth going forward

- All opaque-scheme detection uses the negative-lookahead `(?!\/\/)` in `parseURL`'s
  `_opaqueMatch`. Do not open a second branch elsewhere; extending scheme handling means editing
  this one regex plus plan 004's `SPECIAL_SCHEMES`.
- `stringifyParsedURL`'s `hasAuthority` local is the only place that decides whether to emit
  `//`. Do not inline the check elsewhere; if `withBase` / `joinURL` grow a similar decision,
  factor it through this same helper (extract to a private `_hasAuthority(parsed)` if needed).
