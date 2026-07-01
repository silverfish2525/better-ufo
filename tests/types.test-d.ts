import { describe, expectTypeOf, test } from "vitest";
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
  withoutBase,
  withoutFragment,
  withoutHost,
  withoutLeadingSlash,
  withoutProtocol,
  withoutQuery,
  withoutTrailingSlash,
  withProtocol,
  withQuery,
  withTrailingSlash,
} from "../src";

// A genuinely-dynamic string: refinements must degrade to the base type here.
declare const dyn: string;

describe("query", () => {
  test("getQuery generic type support", () => {
    const result = getQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });

  test("parseQuery generic type support", () => {
    const result = parseQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });

  test("stringifyQuery computes the exact query string for object literals", () => {
    expectTypeOf(
      stringifyQuery({ foo: "bar", baz: "qux" }),
    ).toEqualTypeOf<"foo=bar&baz=qux">();
    expectTypeOf(
      stringifyQuery({ a: "323", b: "asdf" }),
    ).toEqualTypeOf<"a=323&b=asdf">();
    expectTypeOf(
      stringifyQuery({ foo: 1, bar: true }),
    ).toEqualTypeOf<"foo=1&bar=true">();
    // null value -> key only
    expectTypeOf(stringifyQuery({ foo: null })).toEqualTypeOf<"foo">();
    // undefined value -> dropped
    expectTypeOf(
      stringifyQuery({ foo: "bar", skip: undefined }),
    ).toEqualTypeOf<"foo=bar">();
  });

  test("stringifyQuery degrades to string for values needing encoding", () => {
    expectTypeOf(
      stringifyQuery({ email: "some email.com" }),
    ).toEqualTypeOf<string>();
    // dynamic object keeps base type
    expectTypeOf(
      stringifyQuery({} as Record<string, string>),
    ).toEqualTypeOf<string>();
  });

  test("encodeQueryItem computes `key=value` for url-safe literals", () => {
    expectTypeOf(encodeQueryItem("foo", "bar")).toEqualTypeOf<"foo=bar">();
    expectTypeOf(encodeQueryItem("n", 1)).toEqualTypeOf<"n=1">();
    expectTypeOf(encodeQueryItem("flag", true)).toEqualTypeOf<"flag=true">();
    // arrays / encoding-needed values degrade
    expectTypeOf(encodeQueryItem("tags", ["a", "b"])).toEqualTypeOf<string>();
  });

  test("withQuery computes the exact resulting URL for clean bases", () => {
    expectTypeOf(
      withQuery("/foo", { a: "1", b: "2" }),
    ).toEqualTypeOf<"/foo?a=1&b=2">();
    expectTypeOf(
      withQuery("https://api.myanimelist.net/v2/user/@me/animelist/", {
        a: "323",
        b: "asdf",
      }),
    ).toEqualTypeOf<"https://api.myanimelist.net/v2/user/@me/animelist/?a=323&b=asdf">();
    // existing query -> degrade to string (merge is not modelled)
    expectTypeOf(withQuery("/foo?x=1", { a: "1" })).toEqualTypeOf<string>();
    // value needing encoding -> degrade
    expectTypeOf(
      withQuery("/", { email: "some email.com" }),
    ).toEqualTypeOf<string>();
  });
});

describe("slash transforms", () => {
  test("leading slash", () => {
    expectTypeOf(withLeadingSlash("foo")).toEqualTypeOf<"/foo">();
    expectTypeOf(withLeadingSlash("/foo")).toEqualTypeOf<"/foo">();
    expectTypeOf(withoutLeadingSlash("/foo")).toEqualTypeOf<"foo">();
    expectTypeOf(withoutLeadingSlash("/")).toEqualTypeOf<"/">();
  });

  test("trailing slash", () => {
    expectTypeOf(withTrailingSlash("foo")).toEqualTypeOf<"foo/">();
    expectTypeOf(withoutTrailingSlash("/foo/")).toEqualTypeOf<"/foo">();
    expectTypeOf(withoutTrailingSlash("/")).toEqualTypeOf<"/">();
  });

  test("dynamic input keeps base type", () => {
    expectTypeOf(withLeadingSlash(dyn)).toEqualTypeOf<string>();
    expectTypeOf(withTrailingSlash(dyn)).toEqualTypeOf<string>();
    // second-arg variant is never refined
    expectTypeOf(withTrailingSlash("/a", true)).toEqualTypeOf<string>();
  });
});

describe("slash / relative predicates", () => {
  test("literal booleans", () => {
    expectTypeOf(hasLeadingSlash("/foo")).toEqualTypeOf<true>();
    expectTypeOf(hasLeadingSlash("foo")).toEqualTypeOf<false>();
    expectTypeOf(hasTrailingSlash("a/")).toEqualTypeOf<true>();
    expectTypeOf(hasTrailingSlash("a")).toEqualTypeOf<false>();
    expectTypeOf(isRelative("./x")).toEqualTypeOf<true>();
    expectTypeOf(isRelative("../x")).toEqualTypeOf<true>();
    expectTypeOf(isRelative("/x")).toEqualTypeOf<false>();
  });

  test("dynamic input keeps boolean", () => {
    expectTypeOf(hasLeadingSlash(dyn)).toEqualTypeOf<boolean>();
    expectTypeOf(isRelative(dyn)).toEqualTypeOf<boolean>();
  });
});

describe("protocol transforms", () => {
  test("literal protocol swaps", () => {
    expectTypeOf(
      withHttp("https://example.com"),
    ).toEqualTypeOf<"http://example.com">();
    expectTypeOf(
      withHttps("http://example.com"),
    ).toEqualTypeOf<"https://example.com">();
    expectTypeOf(
      withoutProtocol("http://example.com"),
    ).toEqualTypeOf<"example.com">();
    expectTypeOf(
      withProtocol("http://example.com", "ftp://"),
    ).toEqualTypeOf<"ftp://example.com">();
    expectTypeOf(
      withProtocol("//example.com", "ftp://"),
    ).toEqualTypeOf<"ftp://example.com">();
  });

  test("dynamic input keeps string", () => {
    expectTypeOf(withHttp(dyn)).toEqualTypeOf<string>();
  });
});

describe("fragment / host transforms", () => {
  test("literals", () => {
    expectTypeOf(withFragment("/foo", "bar")).toEqualTypeOf<"/foo#bar">();
    expectTypeOf(withFragment("/foo#bar", "baz")).toEqualTypeOf<"/foo#baz">();
    expectTypeOf(withFragment("/foo", "")).toEqualTypeOf<"/foo">();
    expectTypeOf(
      withoutFragment("http://example.com/foo?q=123#bar"),
    ).toEqualTypeOf<"http://example.com/foo?q=123">();
    expectTypeOf(
      withoutHost("http://example.com/foo?q=123#bar"),
    ).toEqualTypeOf<"/foo?q=123#bar">();
    expectTypeOf(withoutHost("http://example.com")).toEqualTypeOf<"/">();
  });
});

describe("joinURL", () => {
  test("literal joins", () => {
    expectTypeOf(joinURL("a", "/b", "/c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinURL("a", "b", "c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinURL("/a", "./b", "c")).toEqualTypeOf<"/a/b/c">();
  });

  test("dynamic segment keeps string", () => {
    expectTypeOf(joinURL("a", dyn)).toEqualTypeOf<string>();
  });
});

describe("parsing", () => {
  test("parsePath computes the exact struct", () => {
    expectTypeOf(parsePath("http://foo.com/foo?test=123#token")).toEqualTypeOf<
      { pathname: "http://foo.com/foo"; search: "?test=123" } & { hash: "#token" }
    >();
  });

  test("parseURL computes the exact struct", () => {
    expectTypeOf(parseURL("http://foo.com/foo?test=123#token")).toEqualTypeOf<{
      protocol: "http:";
      auth: "";
      host: "foo.com";
      pathname: "/foo";
      search: "?test=123";
      hash: "#token";
    }>();
  });

  test("parseFilename computes the last segment", () => {
    expectTypeOf(
      parseFilename("http://example.com/path/to/filename.ext"),
    ).toEqualTypeOf<"filename.ext">();
    // CORR-22: `.hidden-file` fails the strict regex (both sides of the dot
    // must have at least one non-slash char), so the type must narrow to
    // `undefined` — mirroring the runtime.
    expectTypeOf(
      parseFilename("/path/to/.hidden-file", { strict: true }),
    ).toEqualTypeOf<undefined>();
    expectTypeOf(
      parseFilename("/path/to/filename.ext", { strict: true }),
    ).toEqualTypeOf<"filename.ext">();
  });

  test("dynamic input keeps the base struct", () => {
    expectTypeOf(parsePath(dyn)).toEqualTypeOf<ReturnType<typeof parsePath>>();
  });
});

describe("parse extras — baseline", () => {
  test("parseHost returns ParsedHost struct", () => {
    expectTypeOf(parseHost("example.com:8080")).toEqualTypeOf<
      ReturnType<typeof parseHost>
    >();
    expectTypeOf(parseHost(dyn)).toEqualTypeOf<ReturnType<typeof parseHost>>();
  });

  test("parseAuth returns ParsedAuth struct", () => {
    expectTypeOf(parseAuth("user:pass")).toEqualTypeOf<
      ReturnType<typeof parseAuth>
    >();
    expectTypeOf(parseAuth(dyn)).toEqualTypeOf<ReturnType<typeof parseAuth>>();
  });

  test("stringifyParsedURL returns string", () => {
    expectTypeOf(
      stringifyParsedURL({ pathname: "/x" }),
    ).toEqualTypeOf<string>();
    expectTypeOf(
      stringifyParsedURL({ protocol: "https:", host: "example.com" }),
    ).toEqualTypeOf<string>();
  });
});

describe("base transforms — baseline", () => {
  test("withBase returns string", () => {
    expectTypeOf(withBase("/foo", "/api")).toEqualTypeOf<string>();
    expectTypeOf(withBase(dyn, dyn)).toEqualTypeOf<string>();
  });

  test("withoutBase returns string", () => {
    expectTypeOf(withoutBase("/api/foo", "/api")).toEqualTypeOf<string>();
    expectTypeOf(withoutBase(dyn, dyn)).toEqualTypeOf<string>();
  });
});

describe("filterQuery — baseline", () => {
  test("filterQuery returns string", () => {
    expectTypeOf(
      filterQuery("/x?a=1", k => k !== "a"),
    ).toEqualTypeOf<string>();
    expectTypeOf(filterQuery(dyn, () => true)).toEqualTypeOf<string>();
  });
});

describe("resolve / normalize / joinRelative — baseline", () => {
  test("resolveURL: single-base literal identity, else string", () => {
    // No extra inputs → base returned verbatim.
    expectTypeOf(resolveURL("/a")).toEqualTypeOf<"/a">();
    // All-empty extra inputs → base returned verbatim.
    expectTypeOf(resolveURL("/a", "")).toEqualTypeOf<"/a">();
    expectTypeOf(resolveURL("/a", "", "")).toEqualTypeOf<"/a">();
    // Non-empty extra input → runtime join, degrades to string.
    expectTypeOf(resolveURL("/a", "b")).toEqualTypeOf<string>();
    expectTypeOf(resolveURL(dyn, dyn)).toEqualTypeOf<string>();
  });

  test("normalizeURL: identity when input is URL-safe with no percent/query", () => {
    // URL-safe literals with only unreserved chars survive as literals.
    expectTypeOf(normalizeURL("abc")).toEqualTypeOf<"abc">();
    expectTypeOf(normalizeURL("foo-bar_baz")).toEqualTypeOf<"foo-bar_baz">();
    // URLs containing structural chars (`:`, `/`) degrade — the type is
    // conservative here; `normalizeURL` may re-encode the host slot.
    expectTypeOf(normalizeURL("http://a.com/x")).toEqualTypeOf<string>();
    expectTypeOf(normalizeURL("/foo/bar")).toEqualTypeOf<string>();
    // Percent triple → degrades.
    expectTypeOf(normalizeURL("/test%2Bfile")).toEqualTypeOf<string>();
    // Query → degrades.
    expectTypeOf(normalizeURL("/x?a=1")).toEqualTypeOf<string>();
    // Dynamic input always degrades.
    expectTypeOf(normalizeURL(dyn)).toEqualTypeOf<string>();
  });

  test("joinRelativeURL literals refine to precise path", () => {
    expectTypeOf(joinRelativeURL("a", "b", "c")).toEqualTypeOf<"a/b/c">();
    expectTypeOf(joinRelativeURL(dyn, dyn)).toEqualTypeOf<string>();
  });
});

describe("equality predicates — baseline", () => {
  test("isEqual returns boolean", () => {
    expectTypeOf(isEqual("/a", "/a")).toEqualTypeOf<boolean>();
    expectTypeOf(isEqual(dyn, dyn)).toEqualTypeOf<boolean>();
  });

  test("isSamePath returns boolean", () => {
    expectTypeOf(isSamePath("/a", "/a")).toEqualTypeOf<boolean>();
    expectTypeOf(isSamePath(dyn, dyn)).toEqualTypeOf<boolean>();
  });
});

describe("withoutQuery", () => {
  test("dynamic string stays string", () => {
    expectTypeOf(withoutQuery(dyn)).toEqualTypeOf<string>();
  });

  test("literal input with query+fragment yields refined literal", () => {
    expectTypeOf(
      withoutQuery("https://a.com/b?x=1#h"),
    ).toEqualTypeOf<"https://a.com/b#h">();
  });

  test("literal input with query only yields path without query", () => {
    expectTypeOf(withoutQuery("/foo?x=1")).toEqualTypeOf<"/foo">();
  });

  test("literal input without query is identity", () => {
    expectTypeOf(
      withoutQuery("https://a.com/b"),
    ).toEqualTypeOf<"https://a.com/b">();
  });
});

// ---------------------------------------------------------------------------
// joinRelativeURL refined + cleanDoubleSlashes
// ---------------------------------------------------------------------------

describe("joinRelativeURL — refined", () => {
  test("dynamic base degrades to string", () => {
    expectTypeOf(joinRelativeURL(dyn, "/b")).toEqualTypeOf<string>();
  });

  test("literal segments produce literal result", () => {
    expectTypeOf(joinRelativeURL("/a", "b", "c")).toEqualTypeOf<"/a/b/c">();
  });

  test("single literal is identity", () => {
    expectTypeOf(joinRelativeURL("/foo/bar")).toEqualTypeOf<"/foo/bar">();
  });
});

describe("cleanDoubleSlashes", () => {
  test("dynamic string degrades to string", () => {
    expectTypeOf(cleanDoubleSlashes(dyn)).toEqualTypeOf<string>();
  });

  test("literal with no double slashes in path is identity (scheme preserved)", () => {
    expectTypeOf(
      cleanDoubleSlashes("https://example.com/foo/bar"),
    ).toEqualTypeOf<"https://example.com/foo/bar">();
  });

  test("literal with no double slashes in path (no scheme) is identity", () => {
    expectTypeOf(cleanDoubleSlashes("/foo/bar")).toEqualTypeOf<"/foo/bar">();
  });

  test("literal with double slashes in path degrades to string", () => {
    expectTypeOf(cleanDoubleSlashes("/foo//bar")).toEqualTypeOf<string>();
  });

  test("literal with double slashes after scheme degrades to string", () => {
    expectTypeOf(
      cleanDoubleSlashes("https://example.com//foo"),
    ).toEqualTypeOf<string>();
  });
});

// ---------------------------------------------------------------------------
// isScriptProtocol / isSpecialScheme — literal-boolean membership
// (expectations mirror VERIFIED runtime behavior, not the stale JSDoc)
// ---------------------------------------------------------------------------
describe("isSpecialScheme — refined", () => {
  test("dynamic string degrades to boolean", () => {
    expectTypeOf(isSpecialScheme(dyn)).toEqualTypeOf<boolean>();
  });
  test("special scheme with trailing colon → true", () => {
    expectTypeOf(isSpecialScheme("https:")).toEqualTypeOf<true>();
  });
  test("special scheme, no colon, uppercase → true", () => {
    expectTypeOf(isSpecialScheme("HTTP")).toEqualTypeOf<true>();
  });
  test("full URL (embedded colon, not trailing) → false", () => {
    expectTypeOf(isSpecialScheme("https://example.com")).toEqualTypeOf<false>();
  });
  test("non-special scheme → false", () => {
    expectTypeOf(isSpecialScheme("custom:")).toEqualTypeOf<false>();
  });
});

describe("isScriptProtocol — refined", () => {
  test("dynamic string degrades to boolean", () => {
    expectTypeOf(isScriptProtocol(dyn)).toEqualTypeOf<boolean>();
  });
  test("script scheme with trailing colon → true", () => {
    expectTypeOf(isScriptProtocol("javascript:")).toEqualTypeOf<true>();
  });
  test("uppercase script scheme → true", () => {
    expectTypeOf(isScriptProtocol("JAVASCRIPT:")).toEqualTypeOf<true>();
  });
  test("embedded colon (no trailing) → false (runtime parity)", () => {
    expectTypeOf(
      isScriptProtocol("javascript:alert(1)"),
    ).toEqualTypeOf<false>();
  });
  test("non-script scheme → false", () => {
    expectTypeOf(isScriptProtocol("https:")).toEqualTypeOf<false>();
  });
  test("noisy input (leading space) degrades to boolean", () => {
    expectTypeOf(isScriptProtocol("  javascript:")).toEqualTypeOf<boolean>();
  });
  test("noisy input (embedded tab) degrades to boolean", () => {
    expectTypeOf(isScriptProtocol("java\tscript:")).toEqualTypeOf<boolean>();
  });
});
