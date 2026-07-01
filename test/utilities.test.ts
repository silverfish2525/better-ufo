import { describe, expect, test } from "vitest";
import {
  hasProtocol,
  isEqual,
  isRelative,
  parsePath,
  stringifyParsedURL,
  withHttp,
  withHttps,
  withoutProtocol,
  withProtocol,
  isScriptProtocol,
  withFragment,
  withoutFragment,
  withoutHost,
  withoutQuery,
} from "../src";

describe("hasProtocol", () => {
  const tests = [
    // No protocol
    { input: "//", out: [false, false, false] },
    { input: "///", out: [false, false, false] },
    { input: "C:/test", out: [false, false, false] },
    { input: "/test", out: [false, false, false] },

    // Has protocol (strict)
    { input: "custom:/", out: [true, true, true] },
    { input: "https://", out: [true, true, true] },
    { input: "https://test.com", out: [true, true, true] },
    { input: "file:///home/user", out: [true, true, true] },
    { input: String.raw`https:\/foo.com`, out: [true, true, true] },

    // Has protocol (non strict)
    { input: "tel:", out: [true, false, true] },
    { input: "javascript:alert(true)", out: [true, false, true] },
    { input: " javascript:alert(true)", out: [true, false, true] },
    { input: "\0javascript:alert(true)", out: [true, false, true] },
    { input: "\0https://", out: [true, true, true] },
    { input: "tel:123456", out: [true, false, true] },
    { input: "mailto:support@example.com", out: [true, false, true] },

    // Relative
    { input: "//test.com", out: [false, false, true] },
    { input: "///test.com", out: [false, false, true] },
    { input: "/\t//test.com", out: [false, false, true] },
    { input: String.raw`/\/test.com`, out: [false, false, true] },
    { input: String.raw`/\localhost//`, out: [false, false, true] },

    // Test strings are inert — they exercise the parser, not any renderer.
    // SEC-01: WHATWG-mandated \t \n \r stripping inside scheme
    { input: "java\tscript:alert(1)", out: [true, false, true] },
    { input: "java\nscript:alert(1)", out: [true, false, true] },
    { input: "java\rscript:alert(1)", out: [true, false, true] },
    { input: "JAVA\tSCRIPT:alert(1)", out: [true, false, true] },
    { input: "vb\tscript:alert(1)", out: [true, false, true] },
    { input: "da\tta:text/html,x", out: [true, false, true] },
    { input: "bl\tob:x", out: [true, false, true] },
    { input: "ht\ttp://example.com", out: [true, true, true] },
    // Whitespace that browsers do NOT strip stays permissive under default (matches prior behavior,
    // documents the boundary):
    { input: "java\vscript:alert(1)", out: [true, false, true] },
    { input: "java\fscript:alert(1)", out: [true, false, true] },
    { input: "java\u00A0script:alert(1)", out: [true, false, true] },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      const [withDefault, withStrict, withAcceptRelative] = t.out;
      expect(hasProtocol(t.input)).toBe(withDefault);
      expect(hasProtocol(t.input, { strict: true })).toBe(withStrict);
      expect(hasProtocol(t.input, { acceptRelative: true })).toBe(
        withAcceptRelative,
      );
      expect(hasProtocol(t.input, true)).toBe(withAcceptRelative);
    });
  }
});

describe("isScriptProtocol", () => {
  const tests = [
    { input: "blob:", out: true },
    { input: "data:", out: true },
    { input: "javascript:", out: true },
    { input: "javaScript:", out: true },
    { input: "vbscript:", out: true },
    { input: "\0vbscript:", out: true },

    // Test strings are inert — they exercise the parser, not any renderer.
    // SEC-01: tampering inside the scheme must not defeat detection
    { input: "java\tscript:", out: true },
    { input: "java\nscript:", out: true },
    { input: "java\rscript:", out: true },
    { input: "JAVA\tSCRIPT:", out: true },
    { input: "vb\tscript:", out: true },
    { input: "da\tta:", out: true },
    { input: "bl\tob:", out: true },
    { input: " \tjavascript:", out: true }, // leading whitespace + tab inside
    // Negative controls: benign schemes with same tampering must NOT flag as script
    { input: "ht\ttp:", out: false },
    { input: "htt\nps:", out: false },
    { input: "ma\tilto:", out: false },
  ];
  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(isScriptProtocol(t.input)).toBe(t.out);
    });
  }
});

describe("isRelative", () => {
  const tests = [
    { input: "/", out: false },
    { input: ".//", out: true },
    { input: "../test", out: true },
    { input: "https://", out: false },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(isRelative(t.input)).toBe(t.out);
    });
  }
});

describe("stringifyParsedURL", () => {
  const tests = [
    { input: ".#hash", out: ".#hash" },
    { input: ".?foo=123", out: ".?foo=123" },
    { input: "./?foo=123#hash", out: "./?foo=123#hash" },
    { input: "/test?query=123#hash", out: "/test?query=123#hash" },
    { input: "test?query=123#hash", out: "test?query=123#hash" },
    { input: "/%c", out: "/%c" },
    { input: "/%", out: "/%" },
    { input: "//test.com", out: "//test.com" },
    {
      input: "http://foo.com/test?query=123#hash",
      out: "http://foo.com/test?query=123#hash",
    },
    { input: "http://localhost:3000", out: "http://localhost:3000" },
    {
      input: "http://my_email%40gmail.com:password@www.my_site.com",
      out: "http://my_email%40gmail.com:password@www.my_site.com",
    },
    {
      input: "/test?query=123,123#hash, test",
      out: "/test?query=123,123#hash, test",
    },
    {
      input: { host: "google.com" },
      out: "google.com",
    },
    {
      input: { protocol: "https:", host: "google.com" },
      out: "https://google.com",
    },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(
        stringifyParsedURL(
          typeof t.input === "string" ? parsePath(t.input) : t.input,
        ),
      ).toBe(t.out);
    });
  }
});

describe("withHttp", () => {
  const tests = [
    { input: "https://example.com", out: "http://example.com" },
    { input: "ftp://example.com/test?foo", out: "http://example.com/test?foo" },
    {
      input: "https://foo.com/test?query=123#hash",
      out: "http://foo.com/test?query=123#hash",
    },
    { input: "file:///home/user", out: "http:///home/user" },
    { input: "foo.bar.com", out: "http://foo.bar.com" },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(withHttp(t.input)).toBe(t.out);
    });
  }
});

describe("withHttps", () => {
  const tests = [
    { input: "http://example.com", out: "https://example.com" },
    {
      input: "ftp://example.com/test?foo",
      out: "https://example.com/test?foo",
    },
    {
      input: "http://foo.com/test?query=123#hash",
      out: "https://foo.com/test?query=123#hash",
    },
    { input: "file:///home/user", out: "https:///home/user" },
    { input: "foo.bar.com", out: "https://foo.bar.com" },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(withHttps(t.input)).toBe(t.out);
    });
  }
});

describe("withProtocol", () => {
  const tests = [
    {
      input: "example.com",
      protocol: "https://",
      out: "https://example.com",
    },
    {
      input: "//example.com",
      protocol: "https://",
      out: "https://example.com",
    },
    {
      input: "://example.com", // Malformed URL is considered without protocol
      protocol: "https://",
      out: "https://://example.com",
    },
    {
      input: "http://example.com",
      protocol: "https://",
      out: "https://example.com",
    },
    {
      input: "https://example.com",
      protocol: "http://",
      out: "http://example.com",
    },
    {
      input: "ftp://example.com/test?foo",
      protocol: "http://",
      out: "http://example.com/test?foo",
    },
    {
      input: "http://foo.com/test?query=123#hash",
      protocol: "ftp://",
      out: "ftp://foo.com/test?query=123#hash",
    },
    {
      input: "file:///home/user",
      protocol: "https://",
      out: "https:///home/user",
    },
    { input: "tel:1234567890", protocol: "skype:", out: "skype:1234567890" },
    {
      input: "tel://+1234567890",
      protocol: "callto://",
      out: "callto://+1234567890",
    },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(withProtocol(t.input, t.protocol)).toBe(t.out);
    });
  }
});

describe("withoutProtocol", () => {
  const tests = [
    { input: "http://example.com", out: "example.com" },
    { input: "https://example.com", out: "example.com" },
    { input: "ftp://example.com/test?foo", out: "example.com/test?foo" },
    {
      input: "http://foo.com/test?query=123#hash",
      out: "foo.com/test?query=123#hash",
    },
    { input: "file:///home/user", out: "/home/user" },
    { input: "tel:1234567890", out: "1234567890" },
    { input: "mailto:support@example.com", out: "support@example.com" },
    { input: "skype:1234567890", out: "1234567890" },
    { input: "callto://+1234567890", out: "+1234567890" },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(withoutProtocol(t.input)).toBe(t.out);
    });
  }
});

describe("isEqual", () => {
  const tests: { input: [string, string, any?]; out: boolean }[] = [
    { input: ["/foo", "/foo/"], out: true },
    { input: ["foo", "/foo"], out: true },
    { input: ["foo", "/foo/"], out: true },
    { input: ["/foo%20bar/", "/foo bar"], out: true },
    { input: ["foo", "/foo", { leadingSlash: true }], out: false },
    { input: ["foo", "foo/", { trailingSlash: true }], out: false },
    { input: ["/foo%20bar/", "/foo bar", { encoding: true }], out: false },
  ];

  for (const t of tests) {
    test(`${t.input[0]} == ${t.input[1]} ${
      t.input[2] ? JSON.stringify(t.input[2]) : ""
    }`, () => {
      expect(isEqual(t.input[0], t.input[1], t.input[2])).toBe(t.out);
    });
  }
});

describe("withFragment", () => {
  const tests = [
    {
      input: "https://example.com",
      fragment: "foo",
      out: "https://example.com#foo",
    },
    {
      input: "https://example.com#bar",
      fragment: "foo",
      out: "https://example.com#foo",
    },
    { input: "https://example.com", fragment: "", out: "https://example.com" },
    {
      input: "https://example.com#bar",
      fragment: "0",
      out: "https://example.com#0",
    },
    {
      input: "https://example.com#bar",
      fragment: "foo bar",
      out: "https://example.com#foo%20bar",
    },
    {
      input: "https://example.com#bar",
      fragment: "foo/bar",
      out: "https://example.com#foo/bar",
    },
    {
      input: "https://example.com?foo=bar",
      fragment: "baz",
      out: "https://example.com?foo=bar#baz",
    },
  ];

  for (const t of tests) {
    test(`${JSON.stringify(t.input)} + ${JSON.stringify(t.fragment)}`, () => {
      expect(withFragment(t.input, t.fragment)).toBe(t.out);
    });
  }

  test("fast-path: appends '#hash' to normalized input", () => {
    expect(withFragment("https://a.com/b", "h")).toBe("https://a.com/b#h");
  });
  test("fast-path: replaces existing '#hash'", () => {
    expect(withFragment("https://a.com/b#old", "new")).toBe(
      "https://a.com/b#new",
    );
  });
  test("empty hash delegates and returns input unchanged", () => {
    const input = "https://a.com/b";
    expect(withFragment(input, "")).toBe(input);
  });
});

describe("withoutFragment", () => {
  const tests = [
    {
      input: "https://example.com#foo",
      out: "https://example.com",
    },
    {
      input: "https://example.com",
      out: "https://example.com",
    },
    {
      input: "/foo#bar",
      out: "/foo",
    },
    {
      input: "/foo/#bar",
      out: "/foo/",
    },
    {
      input: "/foo?bar#baz",
      out: "/foo?bar",
    },
  ];

  for (const t of tests) {
    test(`${t.input}`, () => {
      expect(withoutFragment(t.input)).toBe(t.out);
    });
  }

  test("fast-path: no '#' returns input identity", () => {
    const input = "https://a.com/b";
    expect(withoutFragment(input)).toBe(input);
    expect(withoutFragment(input) === input).toBe(true);
  });
  test("fast-path: strips '#hash' from normalized input", () => {
    expect(withoutFragment("https://a.com/b#h")).toBe("https://a.com/b");
  });
});

describe("withoutHost", () => {
  const tests = [
    {
      input: "https://example.com",
      out: "/",
    },
    {
      input: "?foo=123#hash",
      out: "/?foo=123#hash",
    },
    {
      input: "?",
      out: "/?",
    },
    {
      input: "https://example.com/test?foo=123#hash",
      out: "/test?foo=123#hash",
    },
    {
      input: "http://localhost:8000/media/search/movie?query=drive",
      out: "/media/search/movie?query=drive",
    },
  ];

  for (const t of tests) {
    test(`${t.input}`, () => {
      expect(withoutHost(t.input)).toBe(t.out);
    });
  }

  test("fast-path: host-less input returned unchanged", () => {
    expect(withoutHost("/a/b")).toBe("/a/b");
  });
  test("slow-path: strips authority from full URL", () => {
    expect(withoutHost("https://a.com/b")).toBe("/b");
  });
});

describe("withoutQuery", () => {
  test("no-query input is returned unchanged (identity)", () => {
    expect(withoutQuery("https://a.com/b")).toBe("https://a.com/b");
  });

  test("query-only: strip query, keep path", () => {
    expect(withoutQuery("https://a.com/b?x=1")).toBe("https://a.com/b");
  });

  test("query + fragment: strip query, keep fragment", () => {
    expect(withoutQuery("https://a.com/b?x=1#h")).toBe("https://a.com/b#h");
  });

  test("fragment-only input is returned unchanged (identity)", () => {
    expect(withoutQuery("https://a.com/b#h")).toBe("https://a.com/b#h");
  });

  test("empty input is returned unchanged (identity)", () => {
    expect(withoutQuery("")).toBe("");
  });

  test("relative path with query: strip query", () => {
    expect(withoutQuery("/foo?x=1")).toBe("/foo");
  });
});
