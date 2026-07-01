import { describe, expect, it, test } from "vitest";
import {
  filterQuery,
  getQuery,
  withQuery,
  parseQuery,
  stringifyQuery,
  encodeQueryItem,
} from "../src";

describe("withQuery", () => {
  const tests = [
    { input: "", query: {}, out: "" },
    { input: "/", query: {}, out: "/" },
    { input: "?test", query: {}, out: "?test" },
    { input: "/?test", query: {}, out: "/?test" },
    { input: "/?test", query: { foo: "0" }, out: "/?test&foo=0" },
    { input: "/?test", query: { foo: 0 }, out: "/?test&foo=0" },
    { input: "/?test", query: { foo: 1 }, out: "/?test&foo=1" },
    { input: "/?test", query: { test: undefined }, out: "/" },
    { input: "/?foo=1", query: { foo: 2 }, out: "/?foo=2" },
    {
      input: "/?foo=1",
      query: { foo: true, bar: false },
      out: "/?foo=true&bar=false",
    },
    { input: "/?foo=1", query: { foo: undefined }, out: "/" },
    { input: "/?foo=1", query: { foo: null }, out: "/?foo" },
    {
      input: "/",
      query: { email: "some email.com" },
      out: "/?email=some+email.com",
    },
    {
      input: "/",
      query: { "key with space": "spaced value" },
      out: "/?key+with+space=spaced+value",
    },
    {
      input: "/",
      query: { str: "&", str2: "%26" },
      out: "/?str=%26&str2=%2526",
    },
    { input: "/?x=1,2,3", query: { y: "1,2,3" }, out: "/?x=1,2,3&y=1,2,3" },
    { input: "http://a.com?v=1", query: { x: 2 }, out: "http://a.com?v=1&x=2" },
    {
      input: "/",
      query: { json: '{"test":["content"]}' },
      out: "/?json=%7B%22test%22:%5B%22content%22%5D%7D",
    },
    { input: "/", query: { param: ["3", ""] }, out: "/?param=3&param=" },
    { input: "/", query: { param: ["", "3"] }, out: "/?param=&param=3" },
    {
      input: "/",
      query: { param: { a: { nested: { object: 123 } } } },
      out: "/?param=%7B%22a%22:%7B%22nested%22:%7B%22object%22:123%7D%7D%7D",
    },
    {
      input: "/",
      query: { param: { a: [{ obj: 1 }, { obj: 2 }] } },
      out: "/?param=%7B%22a%22:%5B%7B%22obj%22:1%7D,%7B%22obj%22:2%7D%5D%7D", // {"a":[{"obj":1},{"obj":2}]}
    },
    {
      input: "/",
      query: { param: { a: [{ obj: [1, 2, 3] }] } },
      out: "/?param=%7B%22a%22:%5B%7B%22obj%22:%5B1,2,3%5D%7D%5D%7D", // {"a":[{"obj":[1,2,3]}]}
    },
    {
      input: "/",
      query: { a: "X", "b[]": [], c: "Y" },
      out: "/?a=X&c=Y",
    },
  ];

  for (const t of tests) {
    test(t.input.toString() + " with " + JSON.stringify(t.query), () => {
      expect(withQuery(t.input, t.query)).toBe(t.out);
    });
  }
});

describe("filterQuery", () => {
  const tests = [
    { input: "/foo", out: "/foo" },
    { input: "/foo?bar=1", out: "/foo" },
    { input: "/foo?bar=1&baz=2", out: "/foo?baz=2" },
  ];
  const predicate = (key: string) => key !== "bar";

  for (const t of tests) {
    test(t.input.toString() + ' filter "bar"', () => {
      expect(filterQuery(t.input, predicate)).toBe(t.out);
    });
  }
});

describe("getQuery", () => {
  const tests = {
    "http://foo.com/foo?test=123&unicode=%E5%A5%BD": {
      test: "123",
      unicode: "好",
    },
    "http://foo.com/?param=3&param=": { param: ["3", ""] },
    "http://foo.com/?param=&param=3": { param: ["", "3"] },
    "http://foo.com/?param=": { param: "" },
    "http://foo.com/?param=&param=2&param=3": { param: ["", "2", "3"] },
    "http://foo.com/?param=%7B%22a%22:%5B%7B%22obj%22:%5B1,2,3%5D%7D%5D%7D": {
      param: '{"a":[{"obj":[1,2,3]}]}',
    },
    "http://foo.com/?toString=foo": { toString: "foo" },
  };

  for (const t in tests) {
    test(t, () => {
      expect(getQuery(t)).toMatchObject(tests[t]);
    });
  }
});

describe("parseQuery", () => {
  it("returns an empty object for an empty string", () => {
    expect(parseQuery("")).toEqual({});
  });

  it("returns an empty object for a bare '?'", () => {
    expect(parseQuery("?")).toEqual({});
  });

  it("parses a key with no '=' as empty-string value", () => {
    expect(parseQuery("a")).toEqual({ a: "" });
  });

  it("parses 'a=' as empty-string value", () => {
    expect(parseQuery("a=")).toEqual({ a: "" });
  });

  it("parses two empty-valued keys", () => {
    expect(parseQuery("a=&b=")).toEqual({ a: "", b: "" });
  });

  it("collects repeated keys into an array of strings", () => {
    expect(parseQuery("a=1&a=2")).toEqual({ a: ["1", "2"] });
  });

  it("decodes percent-encoded characters", () => {
    expect(parseQuery("a=hello%20world")).toEqual({ a: "hello world" });
  });

  it("decodes '+' as space (application/x-www-form-urlencoded behavior)", () => {
    expect(parseQuery("a=hello+world")).toEqual({ a: "hello world" });
  });
});

describe("stringifyQuery", () => {
  it("returns an empty string for an empty object", () => {
    expect(stringifyQuery({})).toBe("");
  });

  it("encodes spaces as '+'", () => {
    expect(stringifyQuery({ a: 1, b: "x y" })).toBe("a=1&b=x+y");
  });

  it("emits repeated keys for array values", () => {
    expect(stringifyQuery({ a: [1, 2] })).toBe("a=1&a=2");
  });
});

describe("encodeQueryItem", () => {
  it("encodes a scalar value, converting space to '+'", () => {
    expect(encodeQueryItem("k", "v v")).toBe("k=v+v");
  });

  it("emits repeated key=value pairs for an array value", () => {
    expect(encodeQueryItem("k", [1, 2])).toBe("k=1&k=2");
  });

  it("emits a bare key (no '=') for null", () => {
    expect(encodeQueryItem("k", null)).toBe("k");
  });

  it("emits a bare key (no '=') for undefined", () => {
    expect(encodeQueryItem("k", undefined)).toBe("k");
  });
});
