import { describe, expect, it } from "vitest";
import {
  decode,
  decodePath,
  decodeQueryKey,
  decodeQueryValue,
  encode,
  encodeHash,
  encodeHost,
  encodeParam,
  encodePath,
  encodeQueryKey,
  encodeQueryValue,
} from "../src/";

describe("encode", () => {
  const tests = [
    {
      input: "https://www.example.com/path/to/file.html",
      out: "https://www.example.com/path/to/file.html",
    },
    {
      input: "https://www.example.com/path/to/file.html?foo=bar",
      out: "https://www.example.com/path/to/file.html?foo=bar",
    },
    {
      input: "https://www.example.com/path/to/file.html?foo=bar&baz=qux",
      out: "https://www.example.com/path/to/file.html?foo=bar&baz=qux",
    },
    {
      input: "https://www.example.com/path/to/file.html#section1",
      out: "https://www.example.com/path/to/file.html#section1",
    },
    {
      input: "https://www.example.com/path/to/file.html#section1&section2",
      out: "https://www.example.com/path/to/file.html#section1&section2",
    },
    {
      input: "https://www.example.com/My Path/File.html",
      out: "https://www.example.com/My%20Path/File.html",
    },
    {
      input: "https://www.example.com/file.html?foo=bar|baz",
      out: "https://www.example.com/file.html?foo=bar|baz",
    },
    {
      input: "https://www.example.com/file.html#section1|section2",
      out: "https://www.example.com/file.html#section1|section2",
    },
    {
      input: "https://www.example.com/file.html?foo=bar&baz=qux|quux",
      out: "https://www.example.com/file.html?foo=bar&baz=qux|quux",
    },
    {
      input: "https://www.example.com/file.html#section1&section2|section3",
      out: "https://www.example.com/file.html#section1&section2|section3",
    },
  ];

  for (const t of tests) {
    it(t.input, () => {
      expect(encode(t.input)).toStrictEqual(t.out);
    });
  }
});

describe("encodeHash", () => {
  const tests = [
    { input: "", output: "" },
    { input: "hello", output: "hello" },
    { input: "{}^", output: "{}^" },
    {
      input: "!@#$%&*()-_=+[]{};:'\",.<>/?`~",
      output: "!@#$%25&*()-_=+%5B%5D{};:'%22,.%3C%3E/?%60~",
    },
    { input: "+=&", output: "+=&" },
    { input: "abc{def}ghi^jkl", output: "abc{def}ghi^jkl" },
  ];

  for (const t of tests) {
    it(t.input.toString(), () => {
      expect(encodeHash(t.input)).toStrictEqual(t.output);
    });
  }
});

describe("encodeQueryValue", () => {
  // Fork policy: WHATWG `application/x-www-form-urlencoded` serializer parity.
  // Every code point outside `[A-Za-z0-9*-._]` is percent-encoded; %20 stays as `+`.
  const tests = [
    { input: "hello world", out: "hello+world" },
    { input: "hello+world", out: "hello%2Bworld" },
    { input: "key=value", out: "key%3Dvalue" },
    { input: true, out: "true" },
    { input: 42, out: "42" },
    { input: "a=1&b=2", out: "a%3D1%26b%3D2" },
    {
      input: String.raw`!@#$%^&*()_+{}[]|\:;<>,./?`,
      out: "%21%40%23%24%25%5E%26*%28%29_%2B%7B%7D%5B%5D%7C%5C%3A%3B%3C%3E%2C.%2F%3F",
    },
  ];

  for (const t of tests) {
    it(t.input.toString(), () => {
      expect(encodeQueryValue(t.input.toString())).toStrictEqual(t.out);
    });
  }

  // TEST-20 + WHATWG form-urlencoded parity: non-string JSON.stringify branch.
  it("non-string input goes through JSON.stringify (form-urlencoded serialization)", () => {
    expect(encodeQueryValue(["apple", "banana", "cherry"])).toBe(
      "%5B%22apple%22%2C%22banana%22%2C%22cherry%22%5D",
    );
    expect(encodeQueryValue({ a: 1 })).toBe("%7B%22a%22%3A1%7D");
    expect(encodeQueryValue(null)).toBe("null");
  });
  it("numeric and boolean scalars survive as their JSON form", () => {
    expect(encodeQueryValue(42)).toBe("42");
    expect(encodeQueryValue(true)).toBe("true");
    expect(encodeQueryValue(false)).toBe("false");
  });
  it("wHATWG form-urlencoded parity with URLSearchParams (regression: issues #233, #240, #301, #302, #304)", () => {
    // Every char that native URLSearchParams encodes should also be encoded here.
    for (const ch of [
      "!",
      "'",
      "(",
      ")",
      "~",
      "^",
      "`",
      "|",
      ";",
      "?",
      ",",
      ":",
      "@",
      "$",
      "=",
    ]) {
      const nativeOut = new URLSearchParams([["k", ch]]).toString().slice(2);
      expect(encodeQueryValue(ch)).toBe(nativeOut);
    }
  });
});

describe("encodeQueryKey", () => {
  const tests = [
    { input: "key", out: "key" },
    { input: "key=value", out: "key%3Dvalue" },
    { input: 123, out: "123" },
    { input: "=value", out: "%3Dvalue" },
  ];

  for (const t of tests) {
    it(t.input.toString(), () => {
      expect(encodeQueryKey(t.input.toString())).toStrictEqual(t.out);
    });
  }
});

describe("encodePath", () => {
  const tests = [
    { input: "path/to/resource", out: "path/to/resource" },
    { input: "/path/to/resource", out: "/path/to/resource" },
    { input: "path?query=value", out: "path%3Fquery=value" },
    { input: "path#hash", out: "path%23hash" },
    { input: "path&param=value", out: "path%26param=value" },
    { input: "path+to+resource", out: "path%2Bto%2Bresource" },
    { input: "path/to/resource/", out: "path/to/resource/" },
    { input: "path/to/re source", out: "path/to/re%20source" },
    { input: "p@th", out: "p@th" },
    { input: "path/to/resource/file.txt", out: "path/to/resource/file.txt" },
  ];

  for (const t of tests) {
    it(t.input, () => {
      expect(encodePath(t.input)).toStrictEqual(t.out);
    });
  }
});

describe("encodeParam", () => {
  const tests = [
    { input: "hello world", out: "hello%20world" },
    { input: "a/b", out: "a%2Fb" },
    { input: "1+2=3", out: "1%2B2=3" },
    { input: "áéíóú", out: "%C3%A1%C3%A9%C3%AD%C3%B3%C3%BA" },
    {
      input: String.raw`!@#$%^&*()_-+=[]{}\|;:'",.<>/?`,
      out: "!@%23$%25%5E%26*()_-%2B=%5B%5D%7B%7D%5C|;:'%22,.%3C%3E%2F%3F",
    },
    { input: 123, out: "123" },
    { input: true, out: "true" },
  ];

  for (const t of tests) {
    it(t.input.toString(), () => {
      expect(encodeParam(t.input.toString())).toStrictEqual(t.out);
    });
  }
});

describe("decode", () => {
  const tests = [
    { input: "%7B%7D%5E", out: "{}^" },
    { input: "%2B%3D%26", out: "+=&" },
    {
      input:
        "!%40%23%24%25%26%2A%28%29-_%3D%2B%5B%5D%7B%7D%3B%3A%27%22%2C.%3C%3E%2F%3F%60%7C%5C%22",
      out: "!@#$%&*()-_=+[]{};:'\",.<>/?`|\\\"",
    },
    { input: "hello%20world", out: "hello world" },
    {
      input: "%3Fkey%3Dvalue%26anotherKey%3DanotherValue",
      out: "?key=value&anotherKey=anotherValue",
    },
    {
      input: "http%3A%2F%2Fexample.com%2Fpage%3Fid%3D123%23details",
      out: "http://example.com/page?id=123#details",
    },
    { input: "foo%2Bbar%2Bbaz", out: "foo+bar+baz" },
  ];

  for (const t of tests) {
    it(t.input.toString(), () => {
      expect(decode(t.input.toString())).toStrictEqual(t.out);
    });
  }
});

describe("decodeQueryKey", () => {
  const tests = [
    { input: "key", out: "key" },
    { input: "key%3Dvalue", out: "key=value" },
    { input: "123", out: "123" },
    { input: "%3Dvalue", out: "=value" },
    { input: "key+with+space", out: "key with space" },
    { input: "key%2bwith%2bplus", out: "key+with+plus" },
  ];

  for (const t of tests) {
    it(t.input.toString(), () => {
      expect(decodeQueryKey(t.input.toString())).toStrictEqual(t.out);
    });
  }
});

describe("decodeQueryValue", () => {
  const tests = [
    { input: "hello+world", out: "hello world" },
    { input: "a=1%26b=2", out: "a=1&b=2" },
    { input: "%2Fpath%2F", out: "/path/" },
    // decodeQueryValue converts '+' to space (application/x-www-form-urlencoded).
    { input: "raw+with+space", out: "raw with space" },
    { input: "%2B", out: "+" },
    { input: "", out: "" },
    // malformed percent-triple falls through decode()'s try/catch.
    { input: "%zz", out: "%zz" },
  ];
  for (const t of tests) {
    it(JSON.stringify(t.input), () => {
      expect(decodeQueryValue(t.input)).toStrictEqual(t.out);
    });
  }
  it("round-trip parity with encodeQueryValue for a common set", () => {
    const samples = ["hello world", "a=1&b=2", "raw+plus", "path/to/x"];
    for (const s of samples) {
      expect(decodeQueryValue(encodeQueryValue(s))).toBe(s);
    }
  });
});

describe("decodePath", () => {
  // decodePath is the counterpart of encodePath and preserves `%2F` (encoded
  // slash) so paths never lose their segment boundaries.
  it("preserves %2F as literal %2F (does not collapse slashes)", () => {
    expect(decodePath("%2Fpath%2Fto%2Ffile")).toBe("%2Fpath%2Fto%2Ffile");
    expect(decodePath("a%2Fb")).toBe("a%2Fb");
  });
  it("decodes non-slash sequences normally", () => {
    expect(decodePath("hello%20world")).toBe("hello world");
    expect(decodePath("foo%3Fbar")).toBe("foo?bar");
    expect(decodePath("foo%23bar")).toBe("foo#bar");
  });
  it("empty and no-op inputs", () => {
    expect(decodePath("")).toBe("");
    expect(decodePath("plain/path")).toBe("plain/path");
  });
  it("malformed percent-triple round-trips via decode() fallback", () => {
    expect(decodePath("%zz")).toBe("%zz");
  });
});

describe("encodeHost", () => {
  it("plain ASCII passthrough", () => {
    expect(encodeHost("example.com")).toBe("example.com");
    expect(encodeHost("a.b.c")).toBe("a.b.c");
    expect(encodeHost("")).toBe("");
  });
  it("iDN via punycode (toASCII)", () => {
    // 例子 encoded via IDNA punycode.
    expect(encodeHost("例子.测试")).toBe("xn--fsqu00a.xn--0zwm56d");
    expect(encodeHost("渋谷.日本")).toBe("xn--i5wq75d.xn--wgv71a");
  });
  it("sEC-20: authority-structural chars are percent-encoded", () => {
    expect(encodeHost("a/b")).toBe("a%2Fb");
    expect(encodeHost("a?b")).toBe("a%3Fb");
    expect(encodeHost("a#b")).toBe("a%23b");
    expect(encodeHost("a@b")).toBe("a%40b");
    expect(encodeHost("a/?#@b")).toBe("a%2F%3F%23%40b");
  });
});
