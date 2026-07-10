import { describe, expectTypeOf, it } from "vite-plus/test";

import {
  cleanDoubleSlashes,
  decode,
  decodePath,
  decodeQueryKey,
  decodeQueryValue,
  encode,
  encodeHash,
  encodeHost,
  encodeParam,
  encodePath,
  encodeQueryItem,
  encodeQueryKey,
  encodeQueryValue,
  filterQuery,
  getQuery,
  hasLeadingSlash,
  hasProtocol,
  hasTrailingSlash,
  isEmptyURL,
  isEqual,
  isNonEmptyURL,
  isRelative,
  isSamePath,
  isScriptProtocol,
  isSpecialScheme,
  joinRelativeURL,
  joinURL,
  normalizeURL,
  parseAuth,
  parseFilename,
  parseHost,
  parsePath,
  parseQuery,
  parseURL,
  resolveURL,
  stringifyParsedURL,
  stringifyQuery,
  withBase,
  withFragment,
  withHost,
  withHttp,
  withHttps,
  withLeadingSlash,
  withPathParameters,
  withPort,
  withProtocol,
  withQuery,
  withTrailingSlash,
  withoutAuth,
  withoutBase,
  withoutFragment,
  withoutHost,
  withoutLeadingSlash,
  withoutPort,
  withoutProtocol,
  withoutQuery,
  withoutTrailingSlash,
} from "../src";
import type {
  ExactPathParameters,
  ExtractPathParameters,
  HasProtocolOptions,
  ParsedAuth,
  ParsedHost,
  ParsedPath,
  ParsedURL,
  ParsedURLBase,
  PathParametersFor,
  WithPathParametersOptions,
  WithPathParametersResult,
} from "../src";
import type { StringifyParsedURLResult } from "../src/_types";

// A genuinely-dynamic string: refinements must degrade to the base type here.
declare const dyn: string;
// A genuinely-wide number: parameter values must degrade to string here.
declare const wideN: number;
// A union literal used to prove union-distributive predicates handle
// Any-member semantics correctly in joinRelativeURL widening.
declare const maybeScheme: "a" | "http:";

describe("query", () => {
  it("getQuery generic type support", () => {
    const result = getQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });

  it("parseQuery generic type support", () => {
    const result = parseQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });

  it("parseQuery strips a leading `?` before scanning keys", () => {
    // Runtime `parseQuery` normalizes leading `?` off; the type must too or
    // The key becomes `"?foo"` instead of `"foo"`.
    expectTypeOf(parseQuery("?foo=bar")).toEqualTypeOf<{ foo: "bar" }>();
    expectTypeOf(parseQuery("foo=bar")).toEqualTypeOf<{ foo: "bar" }>();
  });

  it("stringifyQuery computes the exact query string for single-part inputs", () => {
    // Null value -> `key=` (runtime emits `foo=` for null and empty)
    expectTypeOf(stringifyQuery({ foo: null })).toEqualTypeOf<"foo=">();
    // Undefined value -> dropped, single emitted part stays precise
    expectTypeOf(stringifyQuery({ foo: "bar", skip: undefined })).toEqualTypeOf<"foo=bar">();
    // 2+ emitted parts degrade to `string` — `keyof T` iteration order is not stable
    // Across TS typechecker frontends, so a precise literal is not reliably computable.
    expectTypeOf(stringifyQuery({ a: "323", b: "asdf" })).toEqualTypeOf<string>();
  });

  it("stringifyQuery encodes single-key values exactly", () => {
    // Space -> `+` per encodeQueryValue.
    expectTypeOf(
      stringifyQuery({ email: "some email.com" }),
    ).toEqualTypeOf<"email=some+email.com">();
    // Structural characters percent-encode.
    expectTypeOf(
      stringifyQuery({ redirect: "https://x.io/a?b=1" }),
    ).toEqualTypeOf<"redirect=https%3A%2F%2Fx.io%2Fa%3Fb%3D1">();
    // Single-key tuple array expands to repeated key=value pairs.
    expectTypeOf(stringifyQuery({ tags: ["a", "b"] })).toEqualTypeOf<"tags=a&tags=b">();
    // Dynamic object keeps base type — object key order is the boundary.
    expectTypeOf(stringifyQuery({} as Record<string, string>)).toEqualTypeOf<string>();
    // Optional / union-valued field on a multi-key object widens: one branch
    // Emits the key, the other drops it, producing tuples of mixed length.
    // Detector fires on the ≥2-part branch, so the whole result widens.
    const optionalUnion: "1" | undefined = "1";
    expectTypeOf(stringifyQuery({ a: optionalUnion, b: "2" })).toEqualTypeOf<string>();
  });

  it("encodeQueryItem computes `key=value` for url-safe literals", () => {
    expectTypeOf(encodeQueryItem("foo", "bar")).toEqualTypeOf<"foo=bar">();
    expectTypeOf(encodeQueryItem("n", 1)).toEqualTypeOf<"n=1">();
    expectTypeOf(encodeQueryItem("flag", true)).toEqualTypeOf<"flag=true">();
    // Tuple array folds left-to-right, joined by `&`.
    expectTypeOf(encodeQueryItem("tags", ["a", "b"])).toEqualTypeOf<"tags=a&tags=b">();
    // Encoded key/value survives exactly.
    expectTypeOf(
      encodeQueryItem("email", "some email.com"),
    ).toEqualTypeOf<"email=some+email.com">();
  });

  it("stringifyQuery distributes scalar dispatch over unions", () => {
    // `null | "bar"` -> emits either `key=` or `key=bar`.
    expectTypeOf(encodeQueryItem("foo", "bar" as null | "bar")).toEqualTypeOf<"foo=" | "foo=bar">();
    // `"" | "bar"` -> emits either `key=` or `key=bar`.
    expectTypeOf(encodeQueryItem("foo", "bar" as "" | "bar")).toEqualTypeOf<"foo=" | "foo=bar">();
    // `undefined | "bar"` at the top level: undefined is dropped, "bar" encodes.
    expectTypeOf(encodeQueryItem("foo", "bar" as undefined | "bar")).toEqualTypeOf<
      "" | "foo=bar"
    >();
  });

  it("withQuery computes the exact resulting URL for single-part clean bases", () => {
    // Existing query -> degrade to string (merge is not modelled)
    expectTypeOf(withQuery("/foo?x=1", { a: "1" })).toEqualTypeOf<string>();
    // Value needing encoding -> degrade
    expectTypeOf(
      withQuery("/", { email: "some email.com" }),
    ).toEqualTypeOf<"/?email=some+email.com">();
    // 2+ emitted parts degrade — see stringifyQuery test above for rationale.
    expectTypeOf(withQuery("/foo", { a: "1", b: "2" })).toEqualTypeOf<string>();
    expectTypeOf(
      withQuery("https://api.myanimelist.net/v2/user/@me/animelist/", {
        a: "323",
        b: "asdf",
      }),
    ).toEqualTypeOf<string>();
  });
});

describe("slash transforms", () => {
  it("leading slash", () => {
    expectTypeOf(withLeadingSlash("foo")).toEqualTypeOf<"/foo">();
    expectTypeOf(withLeadingSlash("/foo")).toEqualTypeOf<"/foo">();
    expectTypeOf(withoutLeadingSlash("/foo")).toEqualTypeOf<"foo">();
    expectTypeOf(withoutLeadingSlash("/")).toEqualTypeOf<"/">();
  });

  it("trailing slash", () => {
    expectTypeOf(withTrailingSlash("foo")).toEqualTypeOf<"foo/">();
    expectTypeOf(withoutTrailingSlash("/foo/")).toEqualTypeOf<"/foo">();
    expectTypeOf(withoutTrailingSlash("/")).toEqualTypeOf<"/">();
  });

  it("dynamic input keeps base type", () => {
    expectTypeOf(withLeadingSlash(dyn)).toEqualTypeOf<string>();
    expectTypeOf(withTrailingSlash(dyn)).toEqualTypeOf<string>();
    // Second-arg variant is never refined
    expectTypeOf(withTrailingSlash("/a", true)).toEqualTypeOf<string>();
  });
});

describe("slash / relative predicates", () => {
  it("literal booleans", () => {
    expectTypeOf(hasLeadingSlash("/foo")).toEqualTypeOf<true>();
    expectTypeOf(hasLeadingSlash("foo")).toEqualTypeOf<false>();
    expectTypeOf(hasTrailingSlash("a/")).toEqualTypeOf<true>();
    expectTypeOf(hasTrailingSlash("a")).toEqualTypeOf<false>();
    expectTypeOf(isRelative("./x")).toEqualTypeOf<true>();
    expectTypeOf(isRelative("../x")).toEqualTypeOf<true>();
    expectTypeOf(isRelative("/x")).toEqualTypeOf<false>();
  });

  it("dynamic input keeps boolean", () => {
    expectTypeOf(hasLeadingSlash(dyn)).toEqualTypeOf<boolean>();
    expectTypeOf(isRelative(dyn)).toEqualTypeOf<boolean>();
  });
});

describe("protocol transforms", () => {
  it("literal protocol swaps", () => {
    expectTypeOf(withHttp("https://example.com")).toEqualTypeOf<"http://example.com">();
    expectTypeOf(withHttps("http://example.com")).toEqualTypeOf<"https://example.com">();
    expectTypeOf(withoutProtocol("http://example.com")).toEqualTypeOf<"example.com">();
    expectTypeOf(withProtocol("http://example.com", "ftp://")).toEqualTypeOf<"ftp://example.com">();
    expectTypeOf(withProtocol("//example.com", "ftp://")).toEqualTypeOf<"ftp://example.com">();
  });

  it("dynamic input keeps string", () => {
    expectTypeOf(withHttp(dyn)).toEqualTypeOf<string>();
  });
});

describe("fragment / host transforms", () => {
  it("literals", () => {
    expectTypeOf(withFragment("/foo", "bar")).toEqualTypeOf<"/foo#bar">();
    expectTypeOf(withFragment("/foo#bar", "baz")).toEqualTypeOf<"/foo#baz">();
    expectTypeOf(withFragment("/foo", "")).toEqualTypeOf<"/foo">();
    expectTypeOf(
      withoutFragment("http://example.com/foo?q=123#bar"),
    ).toEqualTypeOf<"http://example.com/foo?q=123">();
    expectTypeOf(withoutHost("http://example.com/foo?q=123#bar")).toEqualTypeOf<"/foo?q=123#bar">();
    expectTypeOf(withoutHost("http://example.com")).toEqualTypeOf<"/">();
  });
});

describe("joinURL", () => {
  it("literal joins", () => {
    expectTypeOf(joinURL("a", "/b", "/c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinURL("a", "b", "c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinURL("/a", "./b", "c")).toEqualTypeOf<"/a/b/c">();
  });

  it("dynamic segment keeps string", () => {
    expectTypeOf(joinURL("a", dyn)).toEqualTypeOf<string>();
  });
});

describe("parsing", () => {
  it("parsePath computes the exact struct", () => {
    expectTypeOf(parsePath("http://foo.com/foo?test=123#token")).toEqualTypeOf<
      { pathname: "http://foo.com/foo"; search: "?test=123" } & { hash: "#token" }
    >();
  });

  it("parseURL computes the exact struct", () => {
    expectTypeOf(parseURL("http://foo.com/foo?test=123#token")).toEqualTypeOf<{
      protocol: "http:";
      auth: "";
      host: "foo.com";
      pathname: "/foo";
      search: "?test=123";
      hash: "#token";
    }>();
  });

  it("parseURL — authority URL with credentials", () => {
    expectTypeOf(parseURL("https://u:p@x.io/a")).toEqualTypeOf<{
      protocol: "https:";
      auth: "u:p";
      host: "x.io";
      pathname: "/a";
      search: "";
      hash: "";
    }>();
  });

  it("parseURL — protocol-relative URL exposes no private marker", () => {
    expectTypeOf(parseURL("//x.io/a")).toEqualTypeOf<{
      protocol: "";
      auth: "";
      host: "x.io";
      pathname: "/a";
      search: "";
      hash: "";
    }>();
  });

  it("parseURL widens unmodeled scheme forms (underscore in scheme name)", () => {
    // Runtime `PROTOCOL_REGEX` accepts `\w` (incl. `_`) in scheme, but our
    // Type-level `ScanScheme` only handles ASCII alnum + `+.-`. Rather than
    // Mis-parse `a_b://host/path` as a relative path, widen to `ParsedURLBase`.
    expectTypeOf(parseURL("a_b://host/path")).toEqualTypeOf<ParsedURLBase>();
  });

  it("parseFilename computes the last segment", () => {
    expectTypeOf(
      parseFilename("http://example.com/path/to/filename.ext"),
    ).toEqualTypeOf<"filename.ext">();
    // CORR-22: `.hidden-file` fails the strict regex (both sides of the dot
    // Must have at least one non-slash char), so the type must narrow to
    // `undefined` — mirroring the runtime.
    expectTypeOf(
      parseFilename("/path/to/.hidden-file", { strict: true }),
    ).toEqualTypeOf<undefined>();
    expectTypeOf(
      parseFilename("/path/to/filename.ext", { strict: true }),
    ).toEqualTypeOf<"filename.ext">();
  });

  it("dynamic input keeps the base struct", () => {
    expectTypeOf(parsePath(dyn)).toEqualTypeOf<ParsedPath>();
  });
});

describe("parse extras — refined", () => {
  it("parseHost splits host:port", () => {
    expectTypeOf(parseHost("example.com:8080")).toEqualTypeOf<{
      hostname: "example.com";
      port: "8080";
    }>();
  });
  it("parseHost bare hostname → port undefined", () => {
    expectTypeOf(parseHost("example.com")).toEqualTypeOf<{
      hostname: "example.com";
      port: undefined;
    }>();
  });
  it("parseHost IPv6 with port", () => {
    expectTypeOf(parseHost("[::1]:8080")).toEqualTypeOf<{
      hostname: "[::1]";
      port: "8080";
    }>();
  });
  it("parseHost widens for dynamic input", () => {
    expectTypeOf(parseHost(dyn)).toEqualTypeOf<ParsedHost>();
  });
  it("parseAuth splits user:pass", () => {
    expectTypeOf(parseAuth("user:pass")).toEqualTypeOf<{
      password: "pass";
      username: "user";
    }>();
  });
  it("parseAuth bare username → empty password", () => {
    expectTypeOf(parseAuth("user")).toEqualTypeOf<{ password: ""; username: "user" }>();
  });
  it("parseAuth widens for dynamic input", () => {
    expectTypeOf(parseAuth(dyn)).toEqualTypeOf<ParsedAuth>();
  });
  it("stringifyParsedURL rebuilds from literal fields", () => {
    expectTypeOf(stringifyParsedURL({ pathname: "/x" })).toEqualTypeOf<"/x">();
    expectTypeOf(
      stringifyParsedURL({ host: "example.com", protocol: "https:" }),
    ).toEqualTypeOf<"https://example.com">();
  });
  it("stringifyParsedURL widens on broad or optional string fields", () => {
    // Partial<ParsedURL> has each field as `string | undefined` — the runtime
    // May emit any composition, so the type MUST widen rather than collapse
    // Toward a template subtype like `${string}//${string}...` which is a
    // Proper subtype of `string`, not equal to it.
    expectTypeOf<StringifyParsedURLResult<Partial<ParsedURL>>>().toEqualTypeOf<string>();
  });
  it("stringifyParsedURL widens when protocol is empty and authority is non-empty (hidden `protocolRelative` marker)", () => {
    // Runtime `parseURL("//x.io/a")` sets a hidden `protocolRelative` symbol
    // On the returned object; `stringifyParsedURL` reads that symbol to emit
    // A leading `//`. The public type strips the marker (plan §4), so the
    // Type-level output MUST widen for empty-protocol + non-empty-authority
    // Shapes rather than pretend `"x.io/a"` is exact.
    expectTypeOf(stringifyParsedURL(parseURL("//x.io/a"))).toEqualTypeOf<string>();
    // A direct call without the marker also widens to `string` in this
    // Shape — that's an accepted over-widening (still a valid supertype).
    expectTypeOf(stringifyParsedURL({ host: "x.io", pathname: "/a" })).toEqualTypeOf<string>();
    // Sanity: explicit protocol keeps the exact composition.
    expectTypeOf(
      stringifyParsedURL({ host: "x.io", pathname: "/a", protocol: "https:" }),
    ).toEqualTypeOf<"https://x.io/a">();
  });
});

describe("base transforms — refined", () => {
  it("withBase joins base + input for a fresh path", () => {
    expectTypeOf(withBase("/foo", "/api")).toEqualTypeOf<"/api/foo">();
  });
  it("withBase is identity when input already sits at base boundary", () => {
    expectTypeOf(withBase("/api/foo", "/api")).toEqualTypeOf<"/api/foo">();
  });
  it("withBase widens for dynamic inputs", () => {
    expectTypeOf(withBase(dyn, dyn)).toEqualTypeOf<string>();
  });
  it("withoutBase strips the base prefix", () => {
    expectTypeOf(withoutBase("/api/foo", "/api")).toEqualTypeOf<"/foo">();
  });
  it("withoutBase collapses base-only input to `/`", () => {
    expectTypeOf(withoutBase("/v2", "/v2")).toEqualTypeOf<"/">();
  });
  it("withoutBase preserves query at the boundary", () => {
    expectTypeOf(withoutBase("/v2?x=1", "/v2")).toEqualTypeOf<"/?x=1">();
  });
  it("withoutBase preserves fragment at the boundary", () => {
    expectTypeOf(withoutBase("/v2#f", "/v2")).toEqualTypeOf<"/#f">();
  });
  it("withoutBase widens for dynamic inputs", () => {
    expectTypeOf(withoutBase(dyn, dyn)).toEqualTypeOf<string>();
  });
});

describe("filterQuery — baseline", () => {
  it("no `?` in input → identity literal (runtime short-circuits)", () => {
    expectTypeOf(filterQuery("https://x.io/a", () => false)).toEqualTypeOf<"https://x.io/a">();
  });

  it("uRL with `?` widens — the predicate is evaluated at runtime", () => {
    expectTypeOf(filterQuery("/x?a=1", (k) => k !== "a")).toEqualTypeOf<string>();
  });

  it("dynamic input keeps base string", () => {
    expectTypeOf(filterQuery(dyn, () => true)).toEqualTypeOf<string>();
  });
});

describe("resolve / normalize / joinRelative — baseline", () => {
  it("resolveURL: literal-fold single-base identity, else exact", () => {
    // No extra inputs → base returned verbatim.
    expectTypeOf(resolveURL("/a")).toEqualTypeOf<"/a">();
    // All-empty extra inputs → base returned verbatim.
    expectTypeOf(resolveURL("/a", "")).toEqualTypeOf<"/a">();
    expectTypeOf(resolveURL("/a", "", "")).toEqualTypeOf<"/a">();
    // Non-empty extra input → runtime fold, exact literal.
    expectTypeOf(resolveURL("/a", "b")).toEqualTypeOf<"/a/b">();
    // Dynamic base or segment still widens.
    expectTypeOf(resolveURL(dyn, dyn)).toEqualTypeOf<string>();
  });

  it("resolveURL: extended acceptance cases", () => {
    expectTypeOf(resolveURL("/a", "", "/")).toEqualTypeOf<"/a">();
    expectTypeOf(
      resolveURL("https://x.io/a/", "./b", "../c"),
    ).toEqualTypeOf<"https://x.io/a/./b/../c">();
    expectTypeOf(resolveURL("/a", "b#h")).toEqualTypeOf<"/a/b#h">();
    expectTypeOf(resolveURL("/a#old", "#new")).toEqualTypeOf<"/a#new">();
    expectTypeOf(resolveURL("/a?x=1", "?x=2")).toEqualTypeOf<"/a?x=2">();
    expectTypeOf(resolveURL("//x.io/a", "b")).toEqualTypeOf<"//x.io/a/b">();
    // Merged multi-key query stays broad — object key order is the boundary.
    expectTypeOf(resolveURL("/a?x=1", "b?y=2")).toEqualTypeOf<string>();
  });

  it("normalizeURL: exact for URL-safe and single-key query", () => {
    // URL-safe literals with only unreserved chars survive as literals.
    expectTypeOf(normalizeURL("abc")).toEqualTypeOf<"abc">();
    expectTypeOf(normalizeURL("foo-bar_baz")).toEqualTypeOf<"foo-bar_baz">();
    // Path-only literal now normalizes to an exact literal.
    expectTypeOf(normalizeURL("/foo/bar")).toEqualTypeOf<"/foo/bar">();
    // Authority URL normalizes exactly.
    expectTypeOf(normalizeURL("http://a.com/x")).toEqualTypeOf<"http://a.com/x">();
    // Single-key query round-trips through parse + stringify exactly.
    expectTypeOf(normalizeURL("/x?a=1")).toEqualTypeOf<"/x?a=1">();
    // Percent triple that is not `%20`/`%2F` still degrades (decode table not modeled).
    expectTypeOf(normalizeURL("/test%2Bfile")).toEqualTypeOf<string>();
    // Dynamic input always degrades.
    expectTypeOf(normalizeURL(dyn)).toEqualTypeOf<string>();
  });

  it("normalizeURL: extended acceptance cases", () => {
    expectTypeOf(normalizeURL("https://x.io/a")).toEqualTypeOf<"https://x.io/a">();
    expectTypeOf(normalizeURL("https://x.io/a#section")).toEqualTypeOf<"https://x.io/a#section">();
    expectTypeOf(normalizeURL("https://x.io/a?q=y")).toEqualTypeOf<"https://x.io/a?q=y">();
    // `%20` in the path decodes then re-encodes to `%20`.
    expectTypeOf(normalizeURL("https://x.io/a%20b")).toEqualTypeOf<"https://x.io/a%20b">();
    // Query values with space encode with `+` (encodeQueryValue).
    expectTypeOf(
      normalizeURL("https://x.io/a?q=hello world"),
    ).toEqualTypeOf<"https://x.io/a?q=hello+world">();
    // Multi-key query stays broad (object key order is the boundary).
    expectTypeOf(normalizeURL("https://x.io/a?q=1&b=2")).toEqualTypeOf<string>();
    // Auth survives round-trip.
    expectTypeOf(normalizeURL("https://u:p@x.io/a")).toEqualTypeOf<"https://u:p@x.io/a">();
    // Opaque scheme.
    expectTypeOf(
      normalizeURL("mailto:user@example.com"),
    ).toEqualTypeOf<"mailto:user@example.com">();
    // Protocol-relative.
    expectTypeOf(normalizeURL("//x.io/a")).toEqualTypeOf<"//x.io/a">();
    // Special-scheme authority backslash normalization. Disable oxlint's
    // Auto-fix that would rewrite the literal to `String.raw`, which returns
    // Broad `string` and defeats the point of this assertion.
    // oxlint-disable-next-line unicorn/prefer-string-raw
    expectTypeOf(normalizeURL("http://x.io\\b")).toEqualTypeOf<"http://x.io/b">();
  });

  it("joinRelativeURL literals refine to precise path", () => {
    expectTypeOf(joinRelativeURL("a", "b", "c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinRelativeURL(dyn, dyn)).toEqualTypeOf<string>();
  });
});

describe("equality predicates — refined", () => {
  it("isEqual('/a','/a') is literal `true`", () => {
    expectTypeOf(isEqual("/a", "/a")).toEqualTypeOf<true>();
  });
  it("isEqual widens for dynamic inputs", () => {
    expectTypeOf(isEqual(dyn, dyn)).toEqualTypeOf<boolean>();
  });
  it("isEqual with trailingSlash:true stays exact", () => {
    expectTypeOf(isEqual("/a", "/a", { trailingSlash: true })).toEqualTypeOf<true>();
  });
  it("isEqual normalizes leading slash by default (matches runtime)", () => {
    // Runtime `isEqual("foo", "/foo")` prepends `/` to both via `withLeadingSlash`
    // Because `leadingSlash !== true`, then compares — result is `true`.
    expectTypeOf(isEqual("foo", "/foo")).toEqualTypeOf<true>();
  });
  it("isEqual with leadingSlash:true is strict (no normalization)", () => {
    expectTypeOf(isEqual("foo", "/foo", { leadingSlash: true })).toEqualTypeOf<false>();
  });
  it("isSamePath('/a','/a') is literal `true`", () => {
    expectTypeOf(isSamePath("/a", "/a")).toEqualTypeOf<true>();
  });
  it("isSamePath widens for dynamic inputs", () => {
    expectTypeOf(isSamePath(dyn, dyn)).toEqualTypeOf<boolean>();
  });
  it("isSamePath widens for inputs containing `%` (decoding-sensitive)", () => {
    expectTypeOf(isSamePath("/a%20b", "/a%20b")).toEqualTypeOf<boolean>();
  });
});

describe("withoutQuery", () => {
  it("dynamic string stays string", () => {
    expectTypeOf(withoutQuery(dyn)).toEqualTypeOf<string>();
  });

  it("literal input with query+fragment yields refined literal", () => {
    expectTypeOf(withoutQuery("https://a.com/b?x=1#h")).toEqualTypeOf<"https://a.com/b#h">();
  });

  it("literal input with query only yields path without query", () => {
    expectTypeOf(withoutQuery("/foo?x=1")).toEqualTypeOf<"/foo">();
  });

  it("literal input without query is identity", () => {
    expectTypeOf(withoutQuery("https://a.com/b")).toEqualTypeOf<"https://a.com/b">();
  });
});

// ---------------------------------------------------------------------------
// JoinRelativeURL refined + cleanDoubleSlashes
// ---------------------------------------------------------------------------

describe("joinRelativeURL — refined", () => {
  it("dynamic base degrades to string", () => {
    expectTypeOf(joinRelativeURL(dyn, "/b")).toEqualTypeOf<string>();
  });

  it("literal segments produce literal result", () => {
    expectTypeOf(joinRelativeURL("/a", "b", "c")).toEqualTypeOf<"/a/b/c">();
  });

  it("single literal is identity", () => {
    expectTypeOf(joinRelativeURL("/foo/bar")).toEqualTypeOf<"/foo/bar">();
  });

  it("dot-segment fold matches runtime", () => {
    expectTypeOf(joinRelativeURL("/a", "b", "../c")).toEqualTypeOf<"/a/c">();
    expectTypeOf(joinRelativeURL("./a", "b", "..")).toEqualTypeOf<"./a">();
  });

  it("underflow cancels when a subsequent segment increments depth", () => {
    // Runtime: `..` sends depth to -1, `a` brings it back to 0 → result `"a"`.
    expectTypeOf(joinRelativeURL("..", "a")).toEqualTypeOf<"a">();
    // Net-negative depth still emits `../` prefixes.
    expectTypeOf(joinRelativeURL("..", "..", "a")).toEqualTypeOf<"../a">();
    expectTypeOf(joinRelativeURL("..", "..")).toEqualTypeOf<"../../">();
  });

  it("leading prefix comes from the first truthy filtered input, not raw Base", () => {
    // Runtime `parts.filter(Boolean)` drops empty base; filtered[0]="/a" leads with `/`.
    expectTypeOf(joinRelativeURL("", "/a")).toEqualTypeOf<"/a">();
  });

  it("trailing slash preservation comes from the last truthy filtered input", () => {
    // Runtime `input.at(-1)="a/"` (after filter(Boolean)) preserves trailing `/`.
    expectTypeOf(joinRelativeURL("a/", "")).toEqualTypeOf<"a/">();
  });

  it("deep dot-dot underflow past intermediate pushes", () => {
    // Runtime trace of `../../a/..`: depth = -1 -1 +1 -1 = -2, segments=[] → "../../"
    expectTypeOf(joinRelativeURL("../../a/..")).toEqualTypeOf<"../../">();
  });

  it("inputs containing `//` or `://` widen to string", () => {
    // The runtime split regex + protocol guard is not modeled at the type level.
    expectTypeOf(joinRelativeURL("http://x.io", "a")).toEqualTypeOf<string>();
    expectTypeOf(joinRelativeURL("a", "b//c")).toEqualTypeOf<string>();
  });

  it("parts containing `:` widen to string (protocol-sentinel branches unmodeled)", () => {
    // Runtime `joinRelativeURL` has two protocol-sentinel branches: (a) `..`
    // Is SKIPPED when `segments.length === 1 && hasProtocol(segments[0])`, so
    // `joinRelativeURL("http:", "..")` returns `"http:"`, not `""`. (b) After
    // A `:/` merge, `sindex === 1` triggers `${prev}/${next}` composition.
    // The type-level fold does not model `hasProtocol`, so any `:` widens.
    expectTypeOf(joinRelativeURL("http:", "..")).toEqualTypeOf<string>();
    expectTypeOf(joinRelativeURL("http:", "..", "a")).toEqualTypeOf<string>();
    expectTypeOf(joinRelativeURL("mailto:a@b", "c")).toEqualTypeOf<string>();
  });

  it("union literal parts widen when ANY branch contains `:` or `//`", () => {
    // `HasJoinRelativeUnmodeled<"a" | "http:">` distributes to `false | true`
    // = `boolean`. `AnyJoinRelativeUnmodeled` must use `true extends ...`
    // Any-member semantics so a colon-containing union branch widens the
    // Whole call, not just the branches it appears in.
    expectTypeOf(joinRelativeURL(maybeScheme, "..")).toEqualTypeOf<string>();
  });
});

describe("cleanDoubleSlashes", () => {
  it("dynamic string degrades to string", () => {
    expectTypeOf(cleanDoubleSlashes(dyn)).toEqualTypeOf<string>();
  });

  it("literal with no double slashes is identity (with or without scheme)", () => {
    expectTypeOf(
      cleanDoubleSlashes("https://example.com/foo/bar"),
    ).toEqualTypeOf<"https://example.com/foo/bar">();
    expectTypeOf(cleanDoubleSlashes("/foo/bar")).toEqualTypeOf<"/foo/bar">();
  });

  it("literal with `//` in the path collapses to a single slash", () => {
    expectTypeOf(cleanDoubleSlashes("/foo//bar")).toEqualTypeOf<"/foo/bar">();
    expectTypeOf(cleanDoubleSlashes("//api//users//1")).toEqualTypeOf<"/api/users/1">();
  });

  it("scheme separator `://` survives the collapse", () => {
    expectTypeOf(
      cleanDoubleSlashes("https://example.com//foo"),
    ).toEqualTypeOf<"https://example.com/foo">();
    expectTypeOf(
      cleanDoubleSlashes("http://example.com/analyze//http://localhost:3000//"),
    ).toEqualTypeOf<"http://example.com/analyze/http://localhost:3000/">();
  });

  it("query and fragment tails are preserved verbatim", () => {
    // The runtime only collapses slashes in the path portion, so `//` inside
    // The query/fragment sticks around.
    expectTypeOf(cleanDoubleSlashes("/a//b?x=//kept#h")).toEqualTypeOf<"/a/b?x=//kept#h">();
  });
});

// ---------------------------------------------------------------------------
// IsScriptProtocol / isSpecialScheme — literal-boolean membership
// (expectations mirror VERIFIED runtime behavior, not the stale JSDoc)
// ---------------------------------------------------------------------------
describe("isSpecialScheme — refined", () => {
  it("dynamic string degrades to boolean", () => {
    expectTypeOf(isSpecialScheme(dyn)).toEqualTypeOf<boolean>();
  });
  it("special scheme with trailing colon → true", () => {
    expectTypeOf(isSpecialScheme("https:")).toEqualTypeOf<true>();
  });
  it("special scheme, no colon, uppercase → true", () => {
    expectTypeOf(isSpecialScheme("HTTP")).toEqualTypeOf<true>();
  });
  it("full URL (embedded colon, not trailing) → false", () => {
    expectTypeOf(isSpecialScheme("https://example.com")).toEqualTypeOf<false>();
  });
  it("non-special scheme → false", () => {
    expectTypeOf(isSpecialScheme("custom:")).toEqualTypeOf<false>();
  });
});

describe("isScriptProtocol — refined", () => {
  it("dynamic string degrades to boolean", () => {
    expectTypeOf(isScriptProtocol(dyn)).toEqualTypeOf<boolean>();
  });
  it("script scheme with trailing colon → true", () => {
    expectTypeOf(isScriptProtocol("javascript:")).toEqualTypeOf<true>();
  });
  it("uppercase script scheme → true", () => {
    expectTypeOf(isScriptProtocol("JAVASCRIPT:")).toEqualTypeOf<true>();
  });
  it("embedded colon (no trailing) → false (runtime parity)", () => {
    expectTypeOf(isScriptProtocol("javascript:alert(1)")).toEqualTypeOf<false>();
  });
  it("non-script scheme → false", () => {
    expectTypeOf(isScriptProtocol("https:")).toEqualTypeOf<false>();
  });
  it("noisy input (leading space) degrades to boolean", () => {
    expectTypeOf(isScriptProtocol("  javascript:")).toEqualTypeOf<boolean>();
  });
  it("noisy input (embedded tab) degrades to boolean", () => {
    expectTypeOf(isScriptProtocol("java\tscript:")).toEqualTypeOf<boolean>();
  });
});

describe("withPathParameters — refined", () => {
  it("exact literal replacement", () => {
    expectTypeOf(
      withPathParameters("/api/users/{userId}", { userId: "abc" }),
    ).toEqualTypeOf<"/api/users/abc">();
  });
  it("literal number parameter is stringified", () => {
    expectTypeOf(withPathParameters("/n/{n}", { n: 42 })).toEqualTypeOf<"/n/42">();
  });
  it("whitespace around placeholder name is trimmed", () => {
    expectTypeOf(withPathParameters("/x/{ v }", { v: "y" })).toEqualTypeOf<"/x/y">();
  });
  it("missing placeholder call-site return-type semantics (via WithPathParametersResult)", () => {
    expectTypeOf<
      WithPathParametersResult<"/x/{missing}", Record<never, string | number>>
    >().toEqualTypeOf<"/x/{missing}">();
    expectTypeOf<
      WithPathParametersResult<
        "/x/{missing}",
        Record<never, string | number>,
        { onMissing: "empty" }
      >
    >().toEqualTypeOf<"/x/">();
    expectTypeOf<
      WithPathParametersResult<
        "/x/{missing}",
        Record<never, string | number>,
        { onMissing: "throw" }
      >
    >().toEqualTypeOf<never>();
  });
  it("empty `{}` is not a placeholder even with onMissing: throw", () => {
    expectTypeOf(withPathParameters("/x/{}", {}, { onMissing: "throw" })).toEqualTypeOf<"/x/{}">();
  });
  it("nested `{` inside a placeholder name is kept up to first `}`", () => {
    expectTypeOf(withPathParameters("/x/{a{b}", { "a{b": "y" })).toEqualTypeOf<"/x/y">();
  });
  it("`{}x}` has raw key `}x` and is resolved when present", () => {
    expectTypeOf(withPathParameters("/x/{}b}", { "}b": "y" })).toEqualTypeOf<"/x/y">();
  });
  it("slash in value is encoded as %2F", () => {
    expectTypeOf(withPathParameters("/x/{v}", { v: "a/b" })).toEqualTypeOf<"/x/a%2Fb">();
  });
  it("space in value is encoded as %20", () => {
    expectTypeOf(
      withPathParameters("/x/{v}", { v: "has space" }),
    ).toEqualTypeOf<"/x/has%20space">();
  });
  it("plus in value is encoded as %2B", () => {
    expectTypeOf(withPathParameters("/x/{v}", { v: "a+b" })).toEqualTypeOf<"/x/a%2Bb">();
  });
  it("unmodeled non-ASCII char widens to string", () => {
    expectTypeOf(withPathParameters("/x/{v}", { v: "é" })).toEqualTypeOf<string>();
  });
  it("literal `%` widens to string (encoding is ambiguous)", () => {
    expectTypeOf(withPathParameters("/x/{v}", { v: "%" })).toEqualTypeOf<string>();
  });
  it("wide `number` parameter widens to string", () => {
    expectTypeOf(withPathParameters("/x/{n}", { n: wideN })).toEqualTypeOf<string>();
  });
  it("dynamic template widens to string", () => {
    expectTypeOf(withPathParameters(dyn, { v: "y" })).toEqualTypeOf<string>();
  });
  it("custom interpolate regex widens result to string", () => {
    expectTypeOf(
      withPathParameters("/x/{{v}}", { v: "y" }, { interpolate: /\{\{(?<name>[\s\S]+?)\}\}/gu }),
    ).toEqualTypeOf<string>();
  });
  it("options typed broadly as WithPathParametersOptions widens", () => {
    const broadOptions: WithPathParametersOptions = {
      interpolate: /\{\{(?<name>[\s\S]+?)\}\}/gu,
    };
    expectTypeOf(withPathParameters("/x/{{v}}", { v: "y" }, broadOptions)).toEqualTypeOf<string>();
  });
  it("default-shape WithPathParametersOptions still widens (interpolate may be RegExp)", () => {
    const broadDefaultOptions: WithPathParametersOptions = {};
    expectTypeOf(
      withPathParameters("/x/{missing}", {}, broadDefaultOptions),
    ).toEqualTypeOf<string>();
  });
  it("optional onMissing:'empty' still widens (runtime may pick 'leave')", () => {
    const optionalOnMissingOptions: { onMissing?: "empty" } = {};
    expectTypeOf(
      withPathParameters("/x/{missing}", {}, optionalOnMissingOptions),
    ).toEqualTypeOf<string>();
  });
});

describe("withPathParameters — parameter keys", () => {
  it("extracts multiple placeholder keys", () => {
    expectTypeOf<ExtractPathParameters<"/api/users/{userId}/posts/{postId}">>().toEqualTypeOf<
      "userId" | "postId"
    >();
  });
  it("trims whitespace inside placeholder", () => {
    expectTypeOf<ExtractPathParameters<"/x/{ v }">>().toEqualTypeOf<"v">();
  });
  it("empty `{}` yields no key", () => {
    expectTypeOf<ExtractPathParameters<"/x/{}">>().toEqualTypeOf<never>();
  });
  it("nested `{` inside placeholder name is preserved", () => {
    expectTypeOf<ExtractPathParameters<"/x/{a{b}">>().toEqualTypeOf<"a{b">();
  });
  it("`{}b}` extracts raw key `}b`", () => {
    expectTypeOf<ExtractPathParameters<"/x/{}b}">>().toEqualTypeOf<"}b">();
  });
  it("dynamic template widens key union to string", () => {
    expectTypeOf<ExtractPathParameters<string>>().toEqualTypeOf<string>();
  });
  it("pathParametersFor: literal template yields exact shape", () => {
    expectTypeOf<PathParametersFor<"/api/users/{userId}">>().toEqualTypeOf<{
      userId: string | number;
    }>();
  });
  it("pathParametersFor: no-placeholder literal allows only empty shape", () => {
    expectTypeOf<PathParametersFor<"/api/static">>().toEqualTypeOf<
      Record<never, string | number>
    >();
  });
  it("pathParametersFor: dynamic template stays open", () => {
    expectTypeOf<PathParametersFor<string>>().toEqualTypeOf<Record<string, string | number>>();
  });
  it("strict positive call: literal template + required key", () => {
    expectTypeOf(
      withPathParameters("/api/users/{userId}", { userId: "abc" }),
    ).toEqualTypeOf<"/api/users/abc">();
  });
  it("strict positive call: explicit undefined options", () => {
    expectTypeOf(
      // oxlint-disable-next-line unicorn/no-useless-undefined -- exercising the `options: undefined` overload path.
      withPathParameters("/api/users/{userId}", { userId: "abc" }, undefined),
    ).toEqualTypeOf<"/api/users/abc">();
  });
  it("strict positive call: onMissing:'throw' with satisfied key", () => {
    expectTypeOf(
      withPathParameters("/api/users/{userId}", { userId: "abc" }, { onMissing: "throw" }),
    ).toEqualTypeOf<"/api/users/abc">();
  });
  it("dynamic template accepts arbitrary keys", () => {
    expectTypeOf(withPathParameters(dyn, { anything: "abc" })).toEqualTypeOf<string>();
  });
  it("custom interpolate widens and accepts extra keys", () => {
    expectTypeOf(
      withPathParameters(
        "/x/{{userId}}",
        { extra: "x", userId: "abc" },
        { interpolate: /\{\{(?<name>[\s\S]+?)\}\}/gu },
      ),
    ).toEqualTypeOf<string>();
  });
  it("literal template rejects missing required key", () => {
    // @ts-expect-error -- literal template requires the userId parameter key.
    const bad = withPathParameters("/api/users/{userId}", {});
    expectTypeOf(bad).toBeString();
  });
  it("literal template rejects extra object-literal keys", () => {
    const bad = withPathParameters("/api/users/{userId}", {
      // @ts-expect-error -- extra object-literal keys are rejected for default interpolation.
      typo: "x",
      userId: "abc",
    });
    expectTypeOf(bad).toBeString();
  });
  it("no-placeholder literal template rejects any object-literal keys", () => {
    // @ts-expect-error -- templates with no placeholders accept no object-literal parameter keys.
    const bad = withPathParameters("/api/static", { userId: "abc" });
    expectTypeOf(bad).toBeString();
  });
  it("exactPathParameters: extra keys collapse to never", () => {
    expectTypeOf<
      ExactPathParameters<"/api/users/{userId}", { userId: "abc"; typo: "x" }>["typo"]
    >().toEqualTypeOf<never>();
  });
  it("literal template accepts missing keys under onMissing='empty' (widens to string)", () => {
    expectTypeOf(
      withPathParameters("/api/users/{userId}", {}, { onMissing: "empty" }),
    ).toEqualTypeOf<string>();
  });
  it("literal template accepts missing keys under onMissing='leave' (widens to string)", () => {
    expectTypeOf(
      withPathParameters("/api/users/{userId}", {}, { onMissing: "leave" }),
    ).toEqualTypeOf<string>();
  });
  it("literal template still rejects missing keys under onMissing='throw'", () => {
    // @ts-expect-error -- onMissing='throw' preserves strict compile-time enforcement.
    const bad = withPathParameters("/api/users/{userId}", {}, { onMissing: "throw" });
    expectTypeOf(bad).toBeString();
  });
});

describe("encode — refined", () => {
  it("space → %20", () => {
    expectTypeOf(encode(" ")).toEqualTypeOf<"%20">();
  });
  it("pipe restored to `|`", () => {
    expectTypeOf(encode("|")).toEqualTypeOf<"|">();
  });
  it("`%` encodes to `%25` (encodeURI is deterministic)", () => {
    expectTypeOf(encode("%20")).toEqualTypeOf<"%2520">();
  });
  it("mixed unsafe chars", () => {
    expectTypeOf(encode("a b|c")).toEqualTypeOf<"a%20b|c">();
  });
  it("url-safe identity", () => {
    expectTypeOf(encode("abc-123")).toEqualTypeOf<"abc-123">();
  });
  it("dynamic input widens", () => {
    expectTypeOf(encode(dyn)).toEqualTypeOf<string>();
  });
  it("non-ASCII stays broad (UTF-8 byte encoding not modeled)", () => {
    expectTypeOf(encode("héllo world")).toEqualTypeOf<string>();
  });
});

describe("encodeHash — refined", () => {
  it("^{} restored", () => {
    expectTypeOf(encodeHash("^{}")).toEqualTypeOf<"^{}">();
  });
  it("space → %20", () => {
    expectTypeOf(encodeHash("a b")).toEqualTypeOf<"a%20b">();
  });
  it("`%` → %25", () => {
    expectTypeOf(encodeHash("%")).toEqualTypeOf<"%25">();
  });
});

describe("encodePath — refined", () => {
  it("space → %20, `/` unchanged", () => {
    expectTypeOf(encodePath("a b/c")).toEqualTypeOf<"a%20b/c">();
  });
  it("`?` → %3F", () => {
    expectTypeOf(encodePath("a?b")).toEqualTypeOf<"a%3Fb">();
  });
  it("`&` → %26", () => {
    expectTypeOf(encodePath("a&b")).toEqualTypeOf<"a%26b">();
  });
  it("`+` → %2B", () => {
    expectTypeOf(encodePath("a+b")).toEqualTypeOf<"a%2Bb">();
  });
  it("`#` → %23", () => {
    expectTypeOf(encodePath("a#b")).toEqualTypeOf<"a%23b">();
  });
  it("input containing `%` widens (encoded-triple ambiguity + %252F normalization)", () => {
    expectTypeOf(encodePath("%2F")).toEqualTypeOf<string>();
  });
});

describe("encodeParam — refined", () => {
  it("`/` → %2F, space → %20", () => {
    expectTypeOf(encodeParam("a/b c")).toEqualTypeOf<"a%2Fb%20c">();
  });
  it("url-safe identity", () => {
    expectTypeOf(encodeParam("abc-123")).toEqualTypeOf<"abc-123">();
  });
});

describe("encodeQueryValue — refined", () => {
  it("space → `+`, `+` → %2B", () => {
    expectTypeOf(encodeQueryValue("a b+c")).toEqualTypeOf<"a+b%2Bc">();
  });
  it("`=` → %3D", () => {
    expectTypeOf(encodeQueryValue("=")).toEqualTypeOf<"%3D">();
  });
  it("`~` → %7E", () => {
    expectTypeOf(encodeQueryValue("~")).toEqualTypeOf<"%7E">();
  });
  it("`*` unchanged (spec-exempt)", () => {
    expectTypeOf(encodeQueryValue("*")).toEqualTypeOf<"*">();
  });
  it("`|` → %7C", () => {
    expectTypeOf(encodeQueryValue("|")).toEqualTypeOf<"%7C">();
  });
});

describe("encodeQueryKey — refined", () => {
  it("`=` → %3D", () => {
    expectTypeOf(encodeQueryKey("a=b")).toEqualTypeOf<"a%3Db">();
  });
});

describe("encodeHost — refined", () => {
  it("lowercase host identity", () => {
    expectTypeOf(encodeHost("example.com")).toEqualTypeOf<"example.com">();
  });
  it("`/` inside host → %2F", () => {
    expectTypeOf(encodeHost("a/b")).toEqualTypeOf<"a%2Fb">();
  });
  it("`@` inside host → %40", () => {
    expectTypeOf(encodeHost("a@b")).toEqualTypeOf<"a%40b">();
  });
  it("uppercase ASCII host is identity (toASCII does not case-fold ASCII)", () => {
    expectTypeOf(encodeHost("EXAMPLE.com")).toEqualTypeOf<"EXAMPLE.com">();
  });
});

describe("decode — refined", () => {
  it("no `%` in input → identity", () => {
    expectTypeOf(decode("hello")).toEqualTypeOf<"hello">();
  });
  it("`%20` decodes to a space", () => {
    expectTypeOf(decode("%20")).toEqualTypeOf<" ">();
  });
});

describe("decodePath — refined", () => {
  it("no `%` → identity", () => {
    expectTypeOf(decodePath("a/b")).toEqualTypeOf<"a/b">();
  });
  it("`%2F` is preserved (encoded-slash round-trip)", () => {
    expectTypeOf(decodePath("a%2Fb")).toEqualTypeOf<"a%2Fb">();
  });
  it("`%20` decodes to a literal space", () => {
    expectTypeOf(decodePath("a%20b")).toEqualTypeOf<"a b">();
  });
  it("mixed `%2F` and `%20` decode as documented", () => {
    expectTypeOf(decodePath("a%2Fb%20c")).toEqualTypeOf<"a%2Fb c">();
  });
  it("unmodeled percent triples widen to string", () => {
    expectTypeOf(decodePath("a%25b")).toEqualTypeOf<string>();
  });
});

describe("decodeQueryKey — refined", () => {
  it("`+` → space, no `%`", () => {
    expectTypeOf(decodeQueryKey("a+b")).toEqualTypeOf<"a b">();
  });
  it("`%20` decodes to space alongside `+`", () => {
    expectTypeOf(decodeQueryKey("a%20b")).toEqualTypeOf<"a b">();
  });
});

describe("decodeQueryValue — refined", () => {
  it("`+` → space", () => {
    expectTypeOf(decodeQueryValue("a+b")).toEqualTypeOf<"a b">();
  });
  it("mixed `+` and `%20` fully decodes", () => {
    expectTypeOf(decodeQueryValue("a+b%20c")).toEqualTypeOf<"a b c">();
  });
});

describe("decode — no args", () => {
  it("decode() with no argument is the empty string", () => {
    expectTypeOf(decode()).toEqualTypeOf<"">();
  });
});

describe("encodeHost — no args", () => {
  it("encodeHost() with no argument is the empty string", () => {
    expectTypeOf(encodeHost()).toEqualTypeOf<"">();
  });
});

describe("host transforms — refined", () => {
  it("withHost is identity on relative paths", () => {
    expectTypeOf(withHost("/only/path", "example.com")).toEqualTypeOf<"/only/path">();
  });
  it("withHost replaces host + drops port, preserving auth", () => {
    expectTypeOf(
      withHost("http://user:pw@example.com:8080/x", "new.com"),
    ).toEqualTypeOf<"http://user:pw@new.com/x">();
  });
  it("withHost replaces host on plain absolute URL", () => {
    expectTypeOf(
      withHost("http://example.com/x", "other.com"),
    ).toEqualTypeOf<"http://other.com/x">();
  });
  it("withPort is identity on relative paths", () => {
    expectTypeOf(withPort("/only/path", 8080)).toEqualTypeOf<"/only/path">();
  });
  it("withPort sets a fresh port", () => {
    expectTypeOf(
      withPort("http://example.com/x", 8080),
    ).toEqualTypeOf<"http://example.com:8080/x">();
  });
  it("withPort replaces an existing port", () => {
    expectTypeOf(
      withPort("http://example.com:80/x", 443),
    ).toEqualTypeOf<"http://example.com:443/x">();
  });
  it("withoutPort is identity on relative paths", () => {
    expectTypeOf(withoutPort("/relative/path")).toEqualTypeOf<"/relative/path">();
  });
  it("withoutPort strips an existing port", () => {
    expectTypeOf(withoutPort("http://example.com:8080/x")).toEqualTypeOf<"http://example.com/x">();
  });
  it("withoutPort strips IPv6 port", () => {
    expectTypeOf(withoutPort("http://[::1]:8080/x")).toEqualTypeOf<"http://[::1]/x">();
  });
  it("withoutAuth is identity on relative paths", () => {
    expectTypeOf(withoutAuth("/relative/path")).toEqualTypeOf<"/relative/path">();
  });
  it("withoutAuth strips userinfo", () => {
    expectTypeOf(
      withoutAuth("http://user:pw@example.com/x"),
    ).toEqualTypeOf<"http://example.com/x">();
  });
  it("withoutAuth is no-op on already-authless URL", () => {
    expectTypeOf(withoutAuth("http://example.com/x")).toEqualTypeOf<"http://example.com/x">();
  });
});

describe("uRL predicates — refined", () => {
  it("isEmptyURL('')  is `true`", () => {
    expectTypeOf(isEmptyURL("")).toEqualTypeOf<true>();
  });
  it("isEmptyURL('/') is `true`", () => {
    expectTypeOf(isEmptyURL("/")).toEqualTypeOf<true>();
  });
  it("isEmptyURL('/foo') is `false`", () => {
    expectTypeOf(isEmptyURL("/foo")).toEqualTypeOf<false>();
  });
  it("isEmptyURL widens for dynamic input", () => {
    expectTypeOf(isEmptyURL(dyn)).toEqualTypeOf<boolean>();
  });
  it("isNonEmptyURL('/foo') is `true`", () => {
    expectTypeOf(isNonEmptyURL("/foo")).toEqualTypeOf<true>();
  });
  it("isNonEmptyURL('/') is `false`", () => {
    expectTypeOf(isNonEmptyURL("/")).toEqualTypeOf<false>();
  });
});

describe("hasProtocol — refined", () => {
  it("http:// literal is `true`", () => {
    expectTypeOf(hasProtocol("http://x")).toEqualTypeOf<true>();
  });
  it("data:x literal is `true` in non-strict mode", () => {
    expectTypeOf(hasProtocol("data:x")).toEqualTypeOf<true>();
  });
  it("data:x with strict:true widens (opaque scheme lacks //)", () => {
    expectTypeOf(hasProtocol("data:x", { strict: true })).toEqualTypeOf<boolean>();
  });
  it("//host is `false` by default", () => {
    expectTypeOf(hasProtocol("//host")).toEqualTypeOf<false>();
  });
  it("//host with acceptRelative:true is `true`", () => {
    expectTypeOf(hasProtocol("//host", { acceptRelative: true })).toEqualTypeOf<true>();
  });
  it("broad HasProtocolOptions variable widens (soundness regression)", () => {
    const broadProtocolOptions: HasProtocolOptions = { strict: true };
    expectTypeOf(hasProtocol("data:x", broadProtocolOptions)).toEqualTypeOf<boolean>();
  });
});

describe("parse — no args", () => {
  it("parseAuth() returns empty struct", () => {
    expectTypeOf(parseAuth()).toEqualTypeOf<{ password: ""; username: "" }>();
  });
  it("parseHost() returns empty hostname + undefined port", () => {
    expectTypeOf(parseHost()).toEqualTypeOf<{ hostname: ""; port: undefined }>();
  });
  it("parseHost keeps IPv6 non-numeric port as-is", () => {
    expectTypeOf(parseHost("[::1]:abc")).toEqualTypeOf<{ hostname: "[::1]"; port: "abc" }>();
  });
  it("parseHost IPv6 with empty port → port: undefined (matches runtime)", () => {
    // Runtime `parseHost("[::1]:")` returns `{ hostname: "[::1]", port: undefined }`.
    expectTypeOf(parseHost("[::1]:")).toEqualTypeOf<{ hostname: "[::1]"; port: undefined }>();
  });
  it("parseHost falls back to whole-string hostname when bare port is non-numeric", () => {
    expectTypeOf(parseHost("foo.com:abc")).toEqualTypeOf<{
      hostname: "foo.com:abc";
      port: undefined;
    }>();
  });
  it("parseHost bare host with non-digit numeric-shape port falls back (matches runtime `/\\d+/`)", () => {
    // Runtime `parseHost` splits the port only for `/\d+/`. TypeScript's
    // `${number}` template admits scientific / decimal / underscore forms
    // That the runtime rejects; the type must mirror the runtime narrowly.
    expectTypeOf(parseHost("foo.com:1e2")).toEqualTypeOf<{
      hostname: "foo.com:1e2";
      port: undefined;
    }>();
    expectTypeOf(parseHost("foo.com:1.5")).toEqualTypeOf<{
      hostname: "foo.com:1.5";
      port: undefined;
    }>();
    // Sanity: a normal digit-only port still splits correctly.
    expectTypeOf(parseHost("foo.com:443")).toEqualTypeOf<{
      hostname: "foo.com";
      port: "443";
    }>();
  });
  it("parseHost bare host with empty port falls back (matches runtime `/\\d+/` requiring ≥1 digit)", () => {
    // Runtime `parseHost("foo.com:")` returns `{ hostname: "foo.com:", port: undefined }`
    // Because `""` fails `/\d+/`. Pin the `IsAllDigits<"">` empty guard: if
    // It regressed to `true`, the port would incorrectly split as `""`.
    expectTypeOf(parseHost("foo.com:")).toEqualTypeOf<{
      hostname: "foo.com:";
      port: undefined;
    }>();
  });
});

declare const broadPortNumber: number;
declare const broadPortString: string;

describe("withPort — port validation", () => {
  it("valid 4-digit port refines to literal", () => {
    expectTypeOf(withPort("http://x.io", 8080)).toEqualTypeOf<"http://x.io:8080">();
  });
  it("valid 1-3 digit ports refine", () => {
    expectTypeOf(withPort("http://x.io", 443)).toEqualTypeOf<"http://x.io:443">();
    expectTypeOf(withPort("http://x.io", 80)).toEqualTypeOf<"http://x.io:80">();
  });
  it("port 0 is `never` (runtime throws)", () => {
    expectTypeOf(withPort("http://x.io", 0)).toEqualTypeOf<never>();
  });
  it("port with leading zero is `never`", () => {
    expectTypeOf(withPort("http://x.io", "0080")).toEqualTypeOf<never>();
  });
  it("5-digit port is `string` (may be in `10000..65535` or beyond)", () => {
    // Runtime accepts 10000..65535 and rejects 65536..99999. TypeScript
    // Cannot discriminate 5-digit literals without integer arithmetic, so
    // The type-level boundary is `string` rather than a wrong `never`.
    expectTypeOf(withPort("http://x.io", 65_536)).toEqualTypeOf<string>();
    expectTypeOf(withPort("http://x.io", 65_535)).toEqualTypeOf<string>();
    expectTypeOf(withPort("http://x.io", 10_000)).toEqualTypeOf<string>();
  });
  it("6+ digit port is `never` (provably above 65535)", () => {
    expectTypeOf(withPort("http://x.io", 100_000)).toEqualTypeOf<never>();
  });
  it("decimal / non-integer port is `never` (runtime `validatePort` rejects)", () => {
    expectTypeOf(withPort("http://x.io", 1.5)).toEqualTypeOf<never>();
  });
  it("negative port is `never`", () => {
    expectTypeOf(withPort("http://x.io", -1)).toEqualTypeOf<never>();
  });
  it("non-numeric string port is `never`", () => {
    expectTypeOf(withPort("http://x.io", "abc")).toEqualTypeOf<never>();
  });
  it("broad number port (unknown validity) widens to `string`", () => {
    expectTypeOf(withPort("http://x.io", broadPortNumber)).toEqualTypeOf<string>();
  });
  it("broad string port (unknown validity) widens to `string`", () => {
    expectTypeOf(withPort("http://x.io", broadPortString)).toEqualTypeOf<string>();
  });
  it("invalid port on authority-less input is still `never` (port validates first)", () => {
    // Runtime `withPort` calls `validatePort` BEFORE inspecting the input,
    // So an invalid port throws regardless of whether the input has an
    // Authority slot. Pin the ordering: a relative input with an invalid
    // Port MUST be `never`, not `Input`.
    expectTypeOf(withPort("/only/path", 0)).toEqualTypeOf<never>();
    expectTypeOf(withPort("/only/path", "abc")).toEqualTypeOf<never>();
    expectTypeOf(withPort("/only/path", -1)).toEqualTypeOf<never>();
    // Sanity: a relative input with a provably-valid port is identity.
    expectTypeOf(withPort("/only/path", 443)).toEqualTypeOf<"/only/path">();
  });
});
