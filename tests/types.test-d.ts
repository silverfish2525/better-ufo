import { describe, expectTypeOf, it } from "vite-plus/test";

import {
  cleanDoubleSlashes,
  encodeQueryItem,
  filterQuery,
  getQuery,
  hasLeadingSlash,
  hasTrailingSlash,
  isEqual,
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
  withHttp,
  withHttps,
  withLeadingSlash,
  withProtocol,
  withQuery,
  withTrailingSlash,
  withoutBase,
  withoutFragment,
  withoutHost,
  withoutLeadingSlash,
  withoutProtocol,
  withoutQuery,
  withoutTrailingSlash,
} from "../src";

// A genuinely-dynamic string: refinements must degrade to the base type here.
declare const dyn: string;

describe("query", () => {
  it("getQuery generic type support", () => {
    const result = getQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });

  it("parseQuery generic type support", () => {
    const result = parseQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
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

  it("stringifyQuery degrades to string for values needing encoding", () => {
    expectTypeOf(stringifyQuery({ email: "some email.com" })).toEqualTypeOf<string>();
    // Dynamic object keeps base type
    expectTypeOf(stringifyQuery({} as Record<string, string>)).toEqualTypeOf<string>();
  });

  it("encodeQueryItem computes `key=value` for url-safe literals", () => {
    expectTypeOf(encodeQueryItem("foo", "bar")).toEqualTypeOf<"foo=bar">();
    expectTypeOf(encodeQueryItem("n", 1)).toEqualTypeOf<"n=1">();
    expectTypeOf(encodeQueryItem("flag", true)).toEqualTypeOf<"flag=true">();
    // Arrays / encoding-needed values degrade
    expectTypeOf(encodeQueryItem("tags", ["a", "b"])).toEqualTypeOf<string>();
  });

  it("withQuery computes the exact resulting URL for single-part clean bases", () => {
    // Existing query -> degrade to string (merge is not modelled)
    expectTypeOf(withQuery("/foo?x=1", { a: "1" })).toEqualTypeOf<string>();
    // Value needing encoding -> degrade
    expectTypeOf(withQuery("/", { email: "some email.com" })).toEqualTypeOf<string>();
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
    expectTypeOf(parsePath(dyn)).toEqualTypeOf<ReturnType<typeof parsePath>>();
  });
});

describe("parse extras — baseline", () => {
  it("parseHost returns ParsedHost struct", () => {
    expectTypeOf(parseHost("example.com:8080")).toEqualTypeOf<ReturnType<typeof parseHost>>();
    expectTypeOf(parseHost(dyn)).toEqualTypeOf<ReturnType<typeof parseHost>>();
  });

  it("parseAuth returns ParsedAuth struct", () => {
    expectTypeOf(parseAuth("user:pass")).toEqualTypeOf<ReturnType<typeof parseAuth>>();
    expectTypeOf(parseAuth(dyn)).toEqualTypeOf<ReturnType<typeof parseAuth>>();
  });

  it("stringifyParsedURL returns string", () => {
    expectTypeOf(stringifyParsedURL({ pathname: "/x" })).toEqualTypeOf<string>();
    expectTypeOf(
      stringifyParsedURL({ host: "example.com", protocol: "https:" }),
    ).toEqualTypeOf<string>();
  });
});

describe("base transforms — baseline", () => {
  it("withBase returns string", () => {
    expectTypeOf(withBase("/foo", "/api")).toEqualTypeOf<string>();
    expectTypeOf(withBase(dyn, dyn)).toEqualTypeOf<string>();
  });

  it("withoutBase returns string", () => {
    expectTypeOf(withoutBase("/api/foo", "/api")).toEqualTypeOf<string>();
    expectTypeOf(withoutBase(dyn, dyn)).toEqualTypeOf<string>();
  });
});

describe("filterQuery — baseline", () => {
  it("filterQuery returns string", () => {
    expectTypeOf(filterQuery("/x?a=1", (k) => k !== "a")).toEqualTypeOf<string>();
    expectTypeOf(filterQuery(dyn, () => true)).toEqualTypeOf<string>();
  });
});

describe("resolve / normalize / joinRelative — baseline", () => {
  it("resolveURL: single-base literal identity, else string", () => {
    // No extra inputs → base returned verbatim.
    expectTypeOf(resolveURL("/a")).toEqualTypeOf<"/a">();
    // All-empty extra inputs → base returned verbatim.
    expectTypeOf(resolveURL("/a", "")).toEqualTypeOf<"/a">();
    expectTypeOf(resolveURL("/a", "", "")).toEqualTypeOf<"/a">();
    // Non-empty extra input → runtime join, degrades to string.
    expectTypeOf(resolveURL("/a", "b")).toEqualTypeOf<string>();
    expectTypeOf(resolveURL(dyn, dyn)).toEqualTypeOf<string>();
  });

  it("normalizeURL: identity when input is URL-safe with no percent/query", () => {
    // URL-safe literals with only unreserved chars survive as literals.
    expectTypeOf(normalizeURL("abc")).toEqualTypeOf<"abc">();
    expectTypeOf(normalizeURL("foo-bar_baz")).toEqualTypeOf<"foo-bar_baz">();
    // URLs containing structural chars (`:`, `/`) degrade — the type is
    // Conservative here; `normalizeURL` may re-encode the host slot.
    expectTypeOf(normalizeURL("http://a.com/x")).toEqualTypeOf<string>();
    expectTypeOf(normalizeURL("/foo/bar")).toEqualTypeOf<string>();
    // Percent triple → degrades.
    expectTypeOf(normalizeURL("/test%2Bfile")).toEqualTypeOf<string>();
    // Query → degrades.
    expectTypeOf(normalizeURL("/x?a=1")).toEqualTypeOf<string>();
    // Dynamic input always degrades.
    expectTypeOf(normalizeURL(dyn)).toEqualTypeOf<string>();
  });

  it("joinRelativeURL literals refine to precise path", () => {
    expectTypeOf(joinRelativeURL("a", "b", "c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinRelativeURL(dyn, dyn)).toEqualTypeOf<string>();
  });
});

describe("equality predicates — baseline", () => {
  it("isEqual returns boolean", () => {
    expectTypeOf(isEqual("/a", "/a")).toEqualTypeOf<boolean>();
    expectTypeOf(isEqual(dyn, dyn)).toEqualTypeOf<boolean>();
  });

  it("isSamePath returns boolean", () => {
    expectTypeOf(isSamePath("/a", "/a")).toEqualTypeOf<boolean>();
    expectTypeOf(isSamePath(dyn, dyn)).toEqualTypeOf<boolean>();
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
});

describe("cleanDoubleSlashes", () => {
  it("dynamic string degrades to string", () => {
    expectTypeOf(cleanDoubleSlashes(dyn)).toEqualTypeOf<string>();
  });

  it("literal with no double slashes in path is identity (scheme preserved)", () => {
    expectTypeOf(
      cleanDoubleSlashes("https://example.com/foo/bar"),
    ).toEqualTypeOf<"https://example.com/foo/bar">();
  });

  it("literal with no double slashes in path (no scheme) is identity", () => {
    expectTypeOf(cleanDoubleSlashes("/foo/bar")).toEqualTypeOf<"/foo/bar">();
  });

  it("literal with double slashes in path degrades to string", () => {
    expectTypeOf(cleanDoubleSlashes("/foo//bar")).toEqualTypeOf<string>();
  });

  it("literal with double slashes after scheme degrades to string", () => {
    expectTypeOf(cleanDoubleSlashes("https://example.com//foo")).toEqualTypeOf<string>();
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
