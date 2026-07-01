import { describe, expectTypeOf, test } from "vitest";
import {
  getQuery,
  parseQuery,
  stringifyQuery,
  encodeQueryItem,
  withQuery,
  joinURL,
  withLeadingSlash,
  withoutLeadingSlash,
  withTrailingSlash,
  withoutTrailingSlash,
  hasLeadingSlash,
  hasTrailingSlash,
  isRelative,
  withHttp,
  withHttps,
  withProtocol,
  withoutProtocol,
  withFragment,
  withoutFragment,
  withoutHost,
  parseURL,
  parsePath,
  parseFilename,
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
    expectTypeOf(parsePath("http://foo.com/foo?test=123#token")).toEqualTypeOf<{
      pathname: "http://foo.com/foo";
      search: "?test=123";
      hash: "#token";
    }>();
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
    expectTypeOf(
      parseFilename("/path/to/.hidden-file", { strict: true }),
    ).toEqualTypeOf<".hidden-file">();
  });

  test("dynamic input keeps the base struct", () => {
    expectTypeOf(parsePath(dyn)).toEqualTypeOf<ReturnType<typeof parsePath>>();
  });
});
