# better-ufo

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]

URL utilities for humans — a **security-hardened, WHATWG-conformant, type-refined fork of [`unjs/ufo`](https://github.com/unjs/ufo)**.

> **Attribution:** `better-ufo` builds on the excellent [`ufo`](https://github.com/unjs/ufo)
> package by [@pi0](https://github.com/pi0) and the unjs contributors. See
> [CREDITS.md](./CREDITS.md) for the 17 upstream contributors whose PRs and
> issues are incorporated, and the [LICENSE](./LICENSE) file for the MIT
> copyright (preserved verbatim).

### What this fork adds

- **Strictest possible TypeScript**: return types are inferred down to
  the string literal — `joinURL("a", "/b")` is typed as `"a/b"`,
  `normalizeURL("/foo")` returns `"/foo"`, `withQuery(base, { k: "v" })`
  narrows to `"base?k=v"`. No `string` bleed. If it compiles, the shape
  is guaranteed.
- **Security guards**: proto-pollution filtering in `parseQuery`,
  open-redirect normalization in `joinURL` (opt-out via
  `{ allowProtocolRelative: true }`), credential-leak guard in
  `parseAuth`, `javascript:` / `vbscript:` / `data:` detection via
  `isScriptProtocol`.
- **WHATWG compliance**: `encodeQueryKey` / `encodeQueryValue` are
  byte-for-byte identical to `URLSearchParams.toString()` — `|`,
  `` ` ``, `^`, `@`, `:`, `,`, `;`, `=`, `?` all encoded per spec.
- **RFC 3986 correctness**: opaque-scheme parsing (`mailto:`, `tel:`,
  `urn:`, `data:`, `blob:`), IPv6 host parsing, `withProtocol` preserves
  host on `localhost:9000`.
- **New APIs**: `withHost`, `withPort`, `withoutPort`, `withoutAuth`,
  `withPathParameters`.
- **Full drop-in compatibility**: 100 % additive — every upstream export
  present with the same signature. CJS + ESM + `d.mts` + `d.cts` shipped.

## Requirements

- **Node.js `>=22.0.0`** — Node 20 reached end-of-life on 2026-04-30 and
  is not supported. The library's compiled output targets ES2022, so it
  runs on any modern JavaScript runtime that supports [`URL`][mdn-url]
  (browsers, Deno, Bun, workers, edge), but we only test against Node.
- Package manager: any (`npm`, `pnpm`, `yarn`, `bun`). Contributors use
  [`pnpm@10`][pnpm-corepack] via corepack.

[mdn-url]: https://developer.mozilla.org/en-US/docs/Web/API/URL
[pnpm-corepack]: https://pnpm.io/installation#using-corepack

## Install

Install using npm or your favourite package manager:

```sh
# npm
npm install better-ufo

# yarn
yarn add better-ufo

# pnpm
pnpm add better-ufo

# bun
bun add better-ufo
```

Import utils:

```js
// ESM
import { normalizeURL, joinURL } from "better-ufo";

// CommonJS
const { normalizeURL, joinURL } = require("better-ufo");

// Deno
import { parseURL } from "https://unpkg.com/better-ufo/dist/index.mjs";
```

### Drop-in replacement for `ufo`

If you're already using `ufo`, add an override to swap the implementation
without changing imports:

```jsonc
// package.json (pnpm)
{
  "pnpm": {
    "overrides": {
      "ufo": "npm:better-ufo@^2"
    }
  }
}
```

See [CREDITS.md](./CREDITS.md) for the behavioral differences vs
upstream (all bugfixes/security-guards, no API removals).

<!-- automd:jsdocs src=./src defaultGroup=utils -->

## Encoding Utils

### `decode(text)`

Decodes text using `decodeURIComponent`. Returns the original text if it fails.

### `decodePath(text)`

Decodes path section of URL (consistent with encodePath for slash encoding).

### `decodeQueryKey(text)`

Decodes query key (consistent with `encodeQueryKey` for plus encoding).

### `decodeQueryValue(text)`

Decodes query value (consistent with `encodeQueryValue` for plus encoding).

### `encode(text)`

Encodes characters that need to be encoded in the path, search and hash sections of the URL.

### `encodeHash(text)`

Encodes characters that need to be encoded in the hash section of the URL.

### `encodeParam(text)`

Encodes characters that need to be encoded in the path section of the URL as a param. This function encodes everything `encodePath` does plus the slash (`/`) character.

### `encodePath(text)`

Encodes characters that need to be encoded in the path section of the URL.

### `encodeQueryKey(text)`

Encodes characters that need to be encoded for query values in the query section of the URL and also encodes the `=` character.

### `encodeQueryValue(input)`

Encodes characters that need to be encoded for query values in the query section of the URL.

## Parsing Utils

### `parseAuth(input)`

Takes a string of the form `username:password` and returns an object with the username and password decoded.

### `parseHost(input)`

Takes a string, and returns an object with two properties: `hostname` and `port`.

IPv6 authorities must be wrapped in `[...]` per WHATWG. The returned `hostname` keeps the surrounding brackets to match `new URL(...).hostname` in Node/browsers, so `stringifyParsedURL` and `$URL.href` re-emit the address unchanged.

**Example:**

```js
parseHost("foo.com:8080");
// { hostname: 'foo.com', port: '8080' }

parseHost("[::1]:8080");
// { hostname: '[::1]', port: '8080' }
```

### `stringifyParsedURL(parsed)`

Takes a `ParsedURL` object and returns the stringified URL.

**Example:**

```js
const obj = parseURL("http://foo.com/foo?test=123#token");
obj.host = "bar.com";

stringifyParsedURL(obj); // "http://bar.com/foo?test=123#token"
```

## Utils

### `$URL()`

### `cleanDoubleSlashes(input)`

### `encodeHost(name)`

### `encodeQueryItem(key, value)`

### `filterQuery(input, predicate)`

Filters the query section of the URL, keeping only entries for which `predicate` returns `true`.

**Example:**

```js
filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar"); // "/foo?baz=2"
```

### `getQuery(input)`

Parses and decodes the query object of an input URL into an object.

**Example:**

```js
getQuery("http://foo.com/foo?test=123&unicode=%E5%A5%BD");
// { test: "123", unicode: "好" }
```

### `hasLeadingSlash(input)`

### `hasProtocol(inputString, opts)`

Checks if the input has a protocol.

You can use `{ acceptRelative: true }` to accept relative URLs as valid protocol.

**Example:**

```js
hasProtocol('https://example.com'); // true

hasProtocol("//example.com"); // false

hasProtocol('//example.com', { acceptRelative: true });  // true

hasProtocol("ftp://example.com"); // true

hasProtocol('data:text/plain'); // true

hasProtocol('data:text/plain', { strict: true }); // false
```

### `hasTrailingSlash(input, respectQueryAndFragment?)`

### `isEmptyURL(url)`

Checks if the input URL is empty or `/`.

### `isEqual(a, b, options)`

Checks if two paths are equal regardless of encoding, trailing slash, and leading slash differences.

You can make slash check strict by setting `{ trailingSlash: true, leadingSlash: true }` as options.

You can make encoding check strict by setting `{ encoding: true }` as options.

**Example:**

```js
isEqual("/foo", "foo"); // true
isEqual("foo/", "foo"); // true
isEqual("/foo bar", "/foo%20bar"); // true

// Strict compare
isEqual("/foo", "foo", { leadingSlash: true }); // false
isEqual("foo/", "foo", { trailingSlash: true }); // false
isEqual("/foo bar", "/foo%20bar", { encoding: true }); // false
```

### `isNonEmptyURL(url)`

Checks if the input URL is neither empty nor `/`.

### `isRelative(inputString)`

### `isSamePath(p1, p2)`

Checks if two paths are the same regardless of trailing slash.

**Example:**

```js
isSamePath("/foo", "/foo/"); // true
```

### `isScriptProtocol(protocol?)`

### `isSpecialScheme(scheme?)`

### `joinRelativeURL()`

### `joinURL(base)`

### `normalizeURL(input)`

### `parseFilename(input, opts?: { strict? })`

### `parsePath(input)`

### `parseQuery(parametersString)`

### `parseURL(input, defaultProto?)`

### `resolveURL(base)`

### `SPECIAL_SCHEMES`

- **Type**: `any`
- **Default**: `{}`

### `stringifyQuery(query)`

### `withBase(input, base, opts?)`

Ensures the URL or pathname starts with base.

If input already starts with base, it will not be added again.

**Example:**

```js
withBase("/foo/bar", "/foo"); // "/foo/bar"

withBase("/foo/bar", "/baz"); // "/baz/foo/bar"

// Leading "//" is normalized (SEC-02 open-redirect hardening):
withBase("//attacker.com/x", "/"); // "/attacker.com/x"
// Opt-out is available for callers who genuinely want a protocol-relative URL:
withBase("//host/x", "/", { allowProtocolRelative: true }); // "//host/x"
```

### `withFragment(input, hash)`

### `withHost(input, host)`

Sets or replaces the host authority slot, preserving `auth`, port, path, search, and hash. Relative inputs (no scheme, no leading `//`) are returned unchanged — `withHost` is a *replace* operator, not a promote-to-absolute* operator.

**Example:**

```js
withHost("http://example.com/foo?x=1#h", "other.com")
// Returns "http://other.com/foo?x=1#h"

withHost("http://user:pw@example.com:8080/x", "new.com")
// Returns "http://user:pw@new.com:8080/x"    (auth + port preserved)

withHost("/only/path", "example.com")
// Returns "/only/path"                       (no-op on relative input)
```

### `withHttp(input)`

### `withHttps(input)`

### `withLeadingSlash(input)`

### `withoutAuth(input)`

Strips the userinfo (`user:pass@`) prefix from an absolute URL's authority. No-op on relative inputs or URLs without userinfo.

Note: setting userinfo is intentionally not provided here. Userinfo is a security-sensitive slot, and correct percent-encoding on serialisation is a v2 change (see `TODO(v2)` in `parseAuth`). A safe `withAuth` will land once that fix is in.

**Example:**

```js
withoutAuth("http://user:pw@example.com/x") // "http://example.com/x"
withoutAuth("http://user@example.com/x")    // "http://example.com/x"
withoutAuth("http://example.com/x")         // "http://example.com/x"
withoutAuth("/relative/path")               // "/relative/path"
```

### `withoutBase(input, base)`

Removes the base from the URL or pathname.

If input does not start with base, it will not be removed.

**Example:**

```js
withoutBase("/foo/bar", "/foo"); // "/bar"
```

### `withoutFragment(input)`

### `withoutHost(input)`

### `withoutLeadingSlash(input)`

### `withoutPort(input)`

Strips the port from an absolute URL's authority, leaving everything else untouched. No-op on relative inputs or URLs without a port.

**Example:**

```js
withoutPort("http://example.com:8080/x") // "http://example.com/x"
withoutPort("http://example.com/x")      // "http://example.com/x"
withoutPort("/relative/path")            // "/relative/path"
```

### `withoutProtocol(input)`

### `withoutQuery(input)`

Removes the query string from a URL, preserving path and fragment.

**Example:**

```js
withoutQuery("https://a.com/b?x=1#h")
// Returns "https://a.com/b#h"
```

### `withoutTrailingSlash(input, respectQueryAndFragment?)`

### `withPathParameters(template, parameters, options)`

Substitutes path-parameter placeholders in a URL template with values from a parameters object. Values are percent-encoded via `encodeParam` (which also encodes `/`, so a placeholder occupies exactly one path segment).

**Example:**

```js
withPathParameters("/api/users/{userId}", { userId: "abc" })
// → "/api/users/abc"

withPathParameters("/api/users/{userId}/posts/{postId}", {
  userId: "42",
  postId: "hello",
});
// → "/api/users/42/posts/hello"

// Mustache-style double-brace via custom interpolate:
withPathParameters(
  "/api/users/{{userId}}",
  { userId: "abc" },
  { interpolate: /\{\{([\s\S]+?)\}\}/g },
);
// → "/api/users/abc"
```
Closes upstream unjs/ufo#243.

### `withPort(input, port)`

Sets or replaces the port slot. Accepts `string | number` for ergonomics. Passing `0`, an empty string, or a value outside the 1..65535 range throws `TypeError` — use `withoutPort` to strip.

**Example:**

```js
withPort("http://example.com/x", 8080)   // "http://example.com:8080/x"
withPort("http://example.com:80/x", 443) // "http://example.com:443/x"
withPort("/only/path", 8080)             // "/only/path"  (no-op)
```

### `withProtocol(input, protocol)`

### `withQuery(input, query)`

### `withTrailingSlash(input, respectQueryAndFragment?)`

<!-- /automd -->

## License

[MIT](./LICENSE) — copyright preserved from upstream `unjs/ufo`
(Pooya Parsa). Fork additions also released under MIT.

Special thanks to Eduardo San Martin Morote ([posva](https://github.com/posva))
for [encoding utilities](https://github.com/vuejs/vue-router-next/blob/v4.0.1/src/encoding.ts)
and to the 17 upstream contributors listed in [CREDITS.md](./CREDITS.md).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/better-ufo?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/better-ufo
[npm-downloads-src]: https://img.shields.io/npm/dm/better-ufo?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/better-ufo
[bundle-src]: https://img.shields.io/bundlephobia/minzip/better-ufo?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=better-ufo
