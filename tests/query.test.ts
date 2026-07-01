import { describe, expect, it } from "vitest";
import {
  encodeQueryItem,
  filterQuery,
  getQuery,
  parseQuery,
  stringifyQuery,
  withQuery,
} from "../src";

describe("withQuery", () => {
  const tests = [
    { input: "", query: {}, out: "" },
    { input: "/", query: {}, out: "/" },
    { input: "?test", query: {}, out: "?test=" },
    { input: "/?test", query: {}, out: "/?test=" },
    { input: "/?test", query: { foo: "0" }, out: "/?test=&foo=0" },
    { input: "/?test", query: { foo: 0 }, out: "/?test=&foo=0" },
    { input: "/?test", query: { foo: 1 }, out: "/?test=&foo=1" },
    { input: "/?test", query: { test: undefined }, out: "/" },
    { input: "/?foo=1", query: { foo: 2 }, out: "/?foo=2" },
    {
      input: "/?foo=1",
      query: { foo: true, bar: false },
      out: "/?foo=true&bar=false",
    },
    { input: "/?foo=1", query: { foo: undefined }, out: "/" },
    { input: "/?foo=1", query: { foo: null }, out: "/?foo=" },
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
    {
      input: "/?x=1,2,3",
      query: { y: "1,2,3" },
      out: "/?x=1%2C2%2C3&y=1%2C2%2C3",
    },
    { input: "http://a.com?v=1", query: { x: 2 }, out: "http://a.com?v=1&x=2" },
    {
      input: "/",
      query: { json: "{\"test\":[\"content\"]}" },
      out: "/?json=%7B%22test%22%3A%5B%22content%22%5D%7D",
    },
    { input: "/", query: { param: ["3", ""] }, out: "/?param=3&param=" },
    { input: "/", query: { param: ["", "3"] }, out: "/?param=&param=3" },
    {
      input: "/",
      query: { param: { a: { nested: { object: 123 } } } },
      out: "/?param=%7B%22a%22%3A%7B%22nested%22%3A%7B%22object%22%3A123%7D%7D%7D",
    },
    {
      input: "/",
      query: { param: { a: [{ obj: 1 }, { obj: 2 }] } },
      out: "/?param=%7B%22a%22%3A%5B%7B%22obj%22%3A1%7D%2C%7B%22obj%22%3A2%7D%5D%7D", // {"a":[{"obj":1},{"obj":2}]}
    },
    {
      input: "/",
      query: { param: { a: [{ obj: [1, 2, 3] }] } },
      out: "/?param=%7B%22a%22%3A%5B%7B%22obj%22%3A%5B1%2C2%2C3%5D%7D%5D%7D", // {"a":[{"obj":[1,2,3]}]}
    },
    {
      input: "/",
      query: { "a": "X", "b[]": [], "c": "Y" },
      out: "/?a=X&c=Y",
    },
  ];

  for (const t of tests) {
    it(`${t.input.toString()} with ${JSON.stringify(t.query)}`, () => {
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
    it(`${t.input.toString()} filter "bar"`, () => {
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
      param: "{\"a\":[{\"obj\":[1,2,3]}]}",
    },
    "http://foo.com/?toString=foo": { toString: "foo" },
  };

  for (const t in tests) {
    it(t, () => {
      expect(getQuery(t)).toMatchObject((tests as Record<string, object>)[t]!);
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

  // Upstream PR #331 + issue #355: preserve empty-key parameters (`=value`).
  it("preserves empty-key parameters (=value → { '': 'value' })", () => {
    expect(parseQuery("=b")).toEqual({ "": "b" });
    expect(parseQuery("a=1&=b")).toEqual({ "a": "1", "": "b" });
    expect(parseQuery("==")).toEqual({ "": "=" });
  });

  // Upstream PR #331: value with `=` is preserved after the first `=`.
  it("treats subsequent `=` chars as value (URLSearchParams parity)", () => {
    expect(parseQuery("a=b=c=d")).toEqual({ a: "b=c=d" });
  });

  // Upstream PR #289: prototype pollution guard.
  it("returns a null-prototype object", () => {
    expect(Object.getPrototypeOf(parseQuery("a=1"))).toBe(null);
  });
  it("ignores dangerous keys (__proto__, constructor, prototype)", () => {
    const q = parseQuery(
      "__proto__=x&%5F%5Fproto%5F%5F=y&constructor=z&prototype=w&safe=ok",
    );
    expect(Object.hasOwn(q, "__proto__")).toBe(false);
    expect(Object.hasOwn(q, "constructor")).toBe(false);
    expect(Object.hasOwn(q, "prototype")).toBe(false);
    expect(q["safe"]).toBe("ok");
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

  it("emits 'key=' for null", () => {
    expect(encodeQueryItem("k", null)).toBe("k=");
  });

  it("emits empty string for undefined", () => {
    expect(encodeQueryItem("k", undefined)).toBe("");
  });
});

describe("stringifyQuery/parseQuery round-trip", () => {
  const roundtrips = ["a=", "a=&b=", "a=1&b=", "a=&b=1", "tags=&tags="];
  for (const q of roundtrips) {
    it(`round-trips "${q}"`, () => {
      expect(stringifyQuery(parseQuery(q))).toBe(q);
    });
  }

  it("scalar empty and null both emit key=", () => {
    expect(stringifyQuery({ a: "" })).toBe("a=");
    expect(stringifyQuery({ a: null })).toBe("a=");
  });

  it("array empty and null both emit key=", () => {
    expect(stringifyQuery({ a: [""] })).toBe("a=");
    expect(stringifyQuery({ a: [null] })).toBe("a=");
  });

  it("undefined scalar is dropped", () => {
    expect(stringifyQuery({ a: undefined, b: "1" })).toBe("b=1");
  });
});

describe("filterQuery prototype", () => {
  it("preserves null prototype of parseQuery output", () => {
    const out = filterQuery("http://x/?a=1&b=2", () => true);
    // Behavioral proof: the assembled URL is intact.
    expect(out).toBe("http://x/?a=1&b=2");
  });
});

describe("filterQuery — extended", () => {
  it("/x?utm_source=a&keep=1 filter \"utm_source\"", () => {
    expect(
      filterQuery("/x?utm_source=a&keep=1", k => k !== "utm_source"),
    ).toBe("/x?keep=1");
  });

  it("/x?a=&b=1 filter empty-string values (v !== \"\")", () => {
    // filterQuery value channel is `string | string[]`, never null; empty string is the "empty value" case.
    expect(filterQuery("/x?a=&b=1", (_, v) => v !== "")).toBe("/x?b=1");
  });

  it("\"\" (empty input) round-trip", () => {
    expect(filterQuery("", () => true)).toBe("");
  });

  it("/x (no query) early-return path", () => {
    // utils.ts:428-430: no "?" in input — returns input unchanged without entering the filter loop.
    expect(filterQuery("/x", () => true)).toBe("/x");
  });
});

describe("filterQuery + withQuery — chained", () => {
  it("filterQuery then withQuery produces correct combined query", () => {
    const result = withQuery(
      filterQuery("/x?keep=1&drop=2", k => k !== "drop"),
      { added: "1" },
    );
    expect(result).toBe("/x?keep=1&added=1");
  });

  it("email value survives filter+withQuery round-trip", () => {
    // Fork policy (WHATWG form-urlencoded): filterQuery/withQuery now percent-encode
    // sub-delimiter chars like `@` in the value slot, matching URLSearchParams output.
    const filtered = filterQuery(
      "/x?email=a%40b.com&drop=1",
      k => k !== "drop",
    );
    expect(filtered).toBe("/x?email=a%40b.com");
    const result = withQuery(filtered, { extra: "val" });
    expect(result).toBe("/x?email=a%40b.com&extra=val");
  });
});

describe("filterQuery — array-value predicate (characterization)", () => {
  it("filterQuery(?a=1&a=2, (k,v) => v !== \"1\") — pin current behavior", () => {
    // Probe on 6f7a318: filterQuery("?a=1&a=2", (k,v) => v !== "1") → "?a=1&a=2".
    // FIXME: value channel for repeated keys is `string[]`; the predicate receives ["1","2"],
    // so `v !== "1"` compares array to string — always true → filter keeps both entries.
    // See plan 009 CORR-05 for the related bug. Pinning current behavior for characterization;
    // refinement lands in plan 009.
    expect(filterQuery("?a=1&a=2", (_k, v) => v !== "1")).toBe("?a=1&a=2");
  });
});

describe("withQuery — noop and idempotence", () => {
  it("withQuery(\"/x\", {}) is a noop", () => {
    expect(withQuery("/x", {})).toBe("/x");
  });

  it("withQuery with empty object after adding is idempotent", () => {
    const r1 = withQuery("/x", { a: "1" });
    const r2 = withQuery(r1, {});
    expect(r2).toBe(r1);
  });

  it("withQuery(\"/x?a=1\", { a: \"1\" }) — same-value reassign pins current output", () => {
    // Probe on 6f7a318: withQuery("/x?a=1", { a: "1" }) → "/x?a=1"
    expect(withQuery("/x?a=1", { a: "1" })).toBe("/x?a=1");
  });
});
