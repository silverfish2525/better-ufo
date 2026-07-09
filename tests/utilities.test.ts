import { describe, expect, it } from "vite-plus/test";
import {
  hasProtocol,
  isEqual,
  isRelative,
  isScriptProtocol,
  isSpecialScheme,
  parsePath,
  parseURL,
  stringifyParsedURL,
  withFragment,
  withHost,
  withHttp,
  withHttps,
  withPathParameters,
  withPort,
  withProtocol,
  withoutAuth,
  withoutFragment,
  withoutHost,
  withoutPort,
  withoutProtocol,
  withoutQuery,
} from "../src";
import type { ParsedURL } from "../src";

describe("hasProtocol", () => {
  const tests = [
    // No protocol
    { input: "//", out: [false, false, false] },
    { input: "///", out: [false, false, false] },
    // C: looks like a 1-char scheme per RFC 3986 after {1,} fix (Windows path false-positive is now accepted)
    // RFC 3986: single-char schemes invalid (plan 004)
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
    // Documents the boundary):
    { input: "java\vscript:alert(1)", out: [true, false, true] },
    { input: "java\fscript:alert(1)", out: [true, false, true] },
    { input: "java\u00A0script:alert(1)", out: [true, false, true] },

    // SEC-03: alpha-first scheme enforcement
    { input: "123://foo.com", out: [false, false, false] },
    { input: "1abc://foo.com", out: [false, false, false] },
    { input: "a2c://foo.com", out: [true, true, true] },
    { input: "+abc://foo.com", out: [false, false, false] },
  ];

  it.each(tests)("$input", (t) => {
    const [withDefault, withStrict, withAcceptRelative] = t.out;
    expect(hasProtocol(t.input)).toBe(withDefault);
    expect(hasProtocol(t.input, { strict: true })).toBe(withStrict);
    expect(hasProtocol(t.input, { acceptRelative: true })).toBe(withAcceptRelative);
    expect(hasProtocol(t.input, true)).toBe(withAcceptRelative);
  });

  it("accepts multi-character schemes (non-strict)", () => {
    expect(hasProtocol("s3://bucket")).toBe(true);
    expect(hasProtocol("ws://host")).toBe(true);
    expect(hasProtocol("a://foo")).toBe(false);
  });

  it("accepts multi-character schemes (strict)", () => {
    expect(hasProtocol("s3://bucket", { strict: true })).toBe(true);
    expect(hasProtocol("ws://host", { strict: true })).toBe(true);
  });

  it("still rejects zero-length scheme", () => {
    expect(hasProtocol("://foo", { strict: true })).toBe(false);
    expect(hasProtocol(":foo", { strict: true })).toBe(false);
  });
});

describe("isScriptProtocol", () => {
  const tests = [
    { input: "blob:", out: true },
    { input: "data:", out: true },
    { input: "javascript:", out: true },
    { input: "javaScript:", out: true },
    { input: "vbscript:", out: true },
    { input: "\0vbscript:", out: true },
    { input: "java\tscript:", out: true },
    { input: "java\nscript:", out: true },
    { input: "java\rscript:", out: true },
    { input: "JAVA\tSCRIPT:", out: true },
    { input: "vb\tscript:", out: true },
    { input: "da\tta:", out: true },
    { input: "bl\tob:", out: true },
    { input: " \tjavascript:", out: true },
    { input: "ht\ttp:", out: false },
    { input: "htt\nps:", out: false },
    { input: "ma\tilto:", out: false },
  ];
  it.each(tests)("$input", (t) => {
    expect(isScriptProtocol(t.input)).toBe(t.out);
  });

  it("returns false for missing or empty protocol", () => {
    expect(isScriptProtocol()).toBe(false);
    expect(isScriptProtocol("")).toBe(false);
  });
});

describe("isSpecialScheme", () => {
  it.each([
    { input: "http", out: true },
    { input: "https:", out: true },
    { input: "file:", out: true },
    { input: "mailto:", out: false },
    { input: "javascript:", out: false },
    { input: "", out: false },
    { input: undefined, out: false },
  ])("$input", ({ input, out }) => {
    expect(isSpecialScheme(input)).toBe(out);
  });
});

describe("isRelative", () => {
  const tests = [
    { input: "/", out: false },
    { input: ".//", out: true },
    { input: "../test", out: true },
    { input: "https://", out: false },
  ];

  it.each(tests)("$input", (t) => {
    expect(isRelative(t.input)).toBe(t.out);
  });
});

describe("stringifyParsedURL", () => {
  const stringTests: { input: string; out: string }[] = [
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
  ];
  const objectTests: { input: Partial<ParsedURL>; out: string }[] = [
    { input: { host: "google.com" }, out: "google.com" },
    { input: { host: "google.com", protocol: "https:" }, out: "https://google.com" },
  ];

  it.each(stringTests)("$input", (t) => {
    expect(stringifyParsedURL(parsePath(t.input))).toBe(t.out);
  });

  it.each(objectTests)("$input", (t) => {
    expect(stringifyParsedURL(t.input)).toBe(t.out);
  });

  it.each(stringTests)("$input", (t) => {
    expect(stringifyParsedURL(parsePath(t.input))).toBe(t.out);
  });

  it.each(objectTests)("$input", (t) => {
    expect(stringifyParsedURL(t.input)).toBe(t.out);
  });
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

  it.each(tests)("$input", (t) => {
    expect(withHttp(t.input)).toBe(t.out);
  });
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

  it.each(tests)("$input", (t) => {
    expect(withHttps(t.input)).toBe(t.out);
  });
});

describe("withProtocol", () => {
  const tests = [
    {
      input: "example.com",
      out: "https://example.com",
      protocol: "https://",
    },
    {
      input: "//example.com",
      out: "https://example.com",
      protocol: "https://",
    },
    {
      input: "://example.com",
      out: "https://://example.com",
      protocol: "https://",
    },
    {
      input: "http://example.com",
      out: "https://example.com",
      protocol: "https://",
    },
    {
      input: "https://example.com",
      out: "http://example.com",
      protocol: "http://",
    },
    {
      input: "ftp://example.com/test?foo",
      out: "http://example.com/test?foo",
      protocol: "http://",
    },
    {
      input: "http://foo.com/test?query=123#hash",
      out: "ftp://foo.com/test?query=123#hash",
      protocol: "ftp://",
    },
    {
      input: "file:///home/user",
      out: "https:///home/user",
      protocol: "https://",
    },
    { input: "tel:1234567890", out: "skype:1234567890", protocol: "skype:" },
    {
      input: "tel://+1234567890",
      out: "callto://+1234567890",
      protocol: "callto://",
    },
  ];

  it.each(tests)("$input", (t) => {
    expect(withProtocol(t.input, t.protocol)).toBe(t.out);
  });

  // Issue unjs/ufo#237: `withProtocol('localhost:9000', ...)` used to strip
  // The host and produce `http://9000`. HOST_PORT_RE now disambiguates
  // Hostname:port from opaque URI schemes.
  it("issue #237: preserves host when input is `hostname:port`", () => {
    expect(withProtocol("localhost:9000", "http://")).toBe("http://localhost:9000");
    expect(withProtocol("foo.com:8080/path", "https://")).toBe("https://foo.com:8080/path");
    expect(withProtocol("dev-host.local:3000/x", "http://")).toBe("http://dev-host.local:3000/x");
    // Opaque schemes still get their scheme replaced — the guard only fires
    // For real hostname-shaped inputs (containing `.` or exactly `localhost`).
    expect(withProtocol("tel:1234567890", "skype:")).toBe("skype:1234567890");
    expect(withProtocol("mailto:foo@bar", "skype:")).toBe("skype:foo@bar");
  });
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

  it.each(tests)("$input", (t) => {
    expect(withoutProtocol(t.input)).toBe(t.out);
  });
});

describe("isEqual", () => {
  type IsEqualOptions = Parameters<typeof isEqual>[2];
  const tests: { input: [string, string, IsEqualOptions?]; out: boolean }[] = [
    { input: ["/foo", "/foo/"], out: true },
    { input: ["foo", "/foo"], out: true },
    { input: ["foo", "/foo/"], out: true },
    { input: ["/foo%20bar/", "/foo bar"], out: true },
    { input: ["foo", "/foo", { leadingSlash: true }], out: false },
    { input: ["foo", "foo/", { trailingSlash: true }], out: false },
    { input: ["/foo%20bar/", "/foo bar", { encoding: true }], out: false },
  ];

  it.each(tests)("$input[0] == $input[1] $input[2]", (t) => {
    expect(isEqual(t.input[0], t.input[1], t.input[2])).toBe(t.out);
  });
});

describe("withFragment", () => {
  const tests = [
    {
      fragment: "foo",
      input: "https://example.com",
      out: "https://example.com#foo",
    },
    {
      fragment: "foo",
      input: "https://example.com#bar",
      out: "https://example.com#foo",
    },
    { fragment: "", input: "https://example.com", out: "https://example.com" },
    {
      fragment: "0",
      input: "https://example.com#bar",
      out: "https://example.com#0",
    },
    {
      fragment: "foo bar",
      input: "https://example.com#bar",
      out: "https://example.com#foo%20bar",
    },
    {
      fragment: "foo/bar",
      input: "https://example.com#bar",
      out: "https://example.com#foo/bar",
    },
    {
      fragment: "baz",
      input: "https://example.com?foo=bar",
      out: "https://example.com?foo=bar#baz",
    },
  ];

  it.each(tests)("$input + $fragment", (t) => {
    expect(withFragment(t.input, t.fragment)).toBe(t.out);
  });

  it("fast-path: appends '#hash' to normalized input", () => {
    expect(withFragment("https://a.com/b", "h")).toBe("https://a.com/b#h");
  });
  it("fast-path: replaces existing '#hash'", () => {
    expect(withFragment("https://a.com/b#old", "new")).toBe("https://a.com/b#new");
  });
  it("cORR-20: empty hash strips an existing fragment", () => {
    expect(withFragment("/foo#bar", "")).toBe("/foo");
    expect(withFragment("https://a.com/b#stale", "")).toBe("https://a.com/b");
    expect(withFragment("https://a.com/b#stale", "#")).toBe("https://a.com/b");
  });
  it("empty hash on input without fragment is a no-op", () => {
    const input = "https://a.com/b";
    expect(withFragment(input, "")).toBe(input);
    expect(withFragment(input, "#")).toBe(input);
  });
  it("slow-path: normalizes special-scheme backslashes before replacing hash", () => {
    expect(withFragment(String.raw`HTTP://example.com/a\b#old`, "new hash")).toBe(
      "http://example.com/a/b#new%20hash",
    );
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

  it.each(tests)("$input", (t) => {
    expect(withoutFragment(t.input)).toBe(t.out);
  });

  it("fast-path: no '#' returns input identity", () => {
    const input = "https://a.com/b";
    expect(withoutFragment(input)).toBe(input);
  });
  it("fast-path: strips '#hash' from normalized input", () => {
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
      input: "#foo",
      out: "/#foo",
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

  it.each(tests)("$input", (t) => {
    expect(withoutHost(t.input)).toBe(t.out);
  });

  it("fast-path: host-less input returned unchanged", () => {
    expect(withoutHost("/a/b")).toBe("/a/b");
  });
  it("slow-path: strips authority from full URL", () => {
    expect(withoutHost("https://a.com/b")).toBe("/b");
  });
});

describe("withHost", () => {
  it("replaces host on absolute URL", () => {
    expect(withHost("http://example.com/foo?x=1#h", "other.com")).toBe(
      "http://other.com/foo?x=1#h",
    );
  });
  it("replaces host including port; caller supplies port in the new host if wanted", () => {
    expect(withHost("http://user:pw@example.com:8080/x", "new.com")).toBe(
      "http://user:pw@new.com/x",
    );
    expect(withHost("http://user:pw@example.com:8080/x", "new.com:9090")).toBe(
      "http://user:pw@new.com:9090/x",
    );
  });
  it("no-op on relative input (does not synthesize scheme)", () => {
    expect(withHost("/only/path", "example.com")).toBe("/only/path");
    expect(withHost("?q=1", "example.com")).toBe("?q=1");
    expect(withHost("#h", "example.com")).toBe("#h");
  });
  it("idempotent: withHost(withHost(x, h), h) === withHost(x, h)", () => {
    const once = withHost("http://a.com/x", "b.com");
    expect(withHost(once, "b.com")).toBe(once);
  });
  it("round-trips via parseURL", () => {
    expect(parseURL(withHost("http://a.com/x", "b.com")).host).toBe("b.com");
  });
});

describe("withPort", () => {
  it("sets port when absent", () => {
    expect(withPort("http://example.com/x", 8080)).toBe("http://example.com:8080/x");
  });
  it("replaces existing port", () => {
    expect(withPort("http://example.com:80/x", 443)).toBe("http://example.com:443/x");
  });
  it("accepts string port", () => {
    expect(withPort("http://example.com/x", "8080")).toBe("http://example.com:8080/x");
  });
  it("preserves userinfo and IPv6 brackets", () => {
    expect(withPort("http://u:p@example.com/x", 8080)).toBe("http://u:p@example.com:8080/x");
    expect(withPort("http://[::1]/x", 8080)).toBe("http://[::1]:8080/x");
    expect(withPort("http://[::1]:80/x", 443)).toBe("http://[::1]:443/x");
  });
  it("no-op on relative input", () => {
    expect(withPort("/only/path", 8080)).toBe("/only/path");
  });
  it("rejects invalid ports — boundary values", () => {
    expect(() => withPort("http://a.com/", 0)).toThrow(TypeError);
    expect(() => withPort("http://a.com/", 65_536)).toThrow(TypeError);
    expect(() => withPort("http://a.com/", -1)).toThrow(TypeError);
    expect(() => withPort("http://a.com/", 1.5)).toThrow(TypeError);
    expect(() => withPort("http://a.com/", "abc")).toThrow(TypeError);
  });
  it("rejects empty string port", () => {
    expect(() => withPort("http://a.com/", "")).toThrow(TypeError);
  });
  it("no-op on opaque schemes with no authority slot", () => {
    expect(withPort("mailto:user@example.com", 8080)).toBe("mailto:user@example.com");
  });
});

describe("withoutPort", () => {
  it("strips port from absolute URL", () => {
    expect(withoutPort("http://example.com:8080/x")).toBe("http://example.com/x");
  });
  it("no-op when no port present", () => {
    expect(withoutPort("http://example.com/x")).toBe("http://example.com/x");
  });
  it("no-op on relative input", () => {
    expect(withoutPort("/relative/path")).toBe("/relative/path");
  });
  it("preserves IPv6 brackets", () => {
    expect(withoutPort("http://[::1]:8080/x")).toBe("http://[::1]/x");
  });
  it("idempotent", () => {
    const once = withoutPort("http://a.com:80/x");
    expect(withoutPort(once)).toBe(once);
  });
  it("no-op on opaque schemes with no host", () => {
    expect(withoutPort("mailto:user@example.com")).toBe("mailto:user@example.com");
  });
});

describe("withoutAuth", () => {
  it("strips user:pass@ userinfo", () => {
    expect(withoutAuth("http://user:pw@example.com/x")).toBe("http://example.com/x");
  });
  it("strips user-only userinfo", () => {
    expect(withoutAuth("http://user@example.com/x")).toBe("http://example.com/x");
  });
  it("no-op when no userinfo present", () => {
    expect(withoutAuth("http://example.com/x")).toBe("http://example.com/x");
  });
  it("no-op on relative input", () => {
    expect(withoutAuth("/relative/path")).toBe("/relative/path");
  });
  it("preserves port and IPv6", () => {
    expect(withoutAuth("http://u:p@[::1]:8080/x")).toBe("http://[::1]:8080/x");
  });
  it("idempotent", () => {
    const once = withoutAuth("http://u:p@a.com/x");
    expect(withoutAuth(once)).toBe(once);
  });
});

describe("withoutQuery", () => {
  it("no-query input is returned unchanged (identity)", () => {
    expect(withoutQuery("https://a.com/b")).toBe("https://a.com/b");
  });

  it("query-only: strip query, keep path", () => {
    expect(withoutQuery("https://a.com/b?x=1")).toBe("https://a.com/b");
  });

  it("query + fragment: strip query, keep fragment", () => {
    expect(withoutQuery("https://a.com/b?x=1#h")).toBe("https://a.com/b#h");
  });

  it("fragment-only input is returned unchanged (identity)", () => {
    expect(withoutQuery("https://a.com/b#h")).toBe("https://a.com/b#h");
  });

  it("empty input is returned unchanged (identity)", () => {
    expect(withoutQuery("")).toBe("");
  });

  it("relative path with query: strip query", () => {
    expect(withoutQuery("/foo?x=1")).toBe("/foo");
  });
});

describe("withPathParameters (issue #243)", () => {
  it("substitutes single-brace placeholders", () => {
    expect(withPathParameters("/api/users/{userId}", { userId: "abc" })).toBe("/api/users/abc");
  });
  it("substitutes multiple placeholders", () => {
    expect(
      withPathParameters("/users/{userId}/posts/{postId}", {
        postId: "hello",
        userId: "42",
      }),
    ).toBe("/users/42/posts/hello");
  });
  it("accepts numeric values", () => {
    expect(withPathParameters("/n/{n}", { n: 42 })).toBe("/n/42");
  });
  it("percent-encodes reserved chars in values (via encodeParam)", () => {
    expect(withPathParameters("/x/{v}", { v: "a/b" })).toBe("/x/a%2Fb");
    expect(withPathParameters("/x/{v}", { v: "has space" })).toBe("/x/has%20space");
  });
  it("mustache double-brace via custom interpolate", () => {
    expect(
      withPathParameters(
        "/users/{{userId}}",
        { userId: "abc" },
        { interpolate: /\{\{(?<name>[\s\S]+?)\}\}/gu },
      ),
    ).toBe("/users/abc");
  });
  it("trims placeholder whitespace before lookup", () => {
    expect(withPathParameters("/x/{ v }", { v: "y" })).toBe("/x/y");
  });
  it("missing placeholder: default is `leave` (match kept verbatim)", () => {
    expect(withPathParameters("/x/{missing}", {})).toBe("/x/{missing}");
  });
  it("missing placeholder: onMissing='empty' substitutes empty string", () => {
    expect(withPathParameters("/x/{a}/{b}", { a: "1" }, { onMissing: "empty" })).toBe("/x/1/");
  });
  it("missing placeholder: onMissing='throw' throws TypeError", () => {
    expect(() => withPathParameters("/x/{missing}", {}, { onMissing: "throw" })).toThrow(TypeError);
  });
  it("rejects non-global interpolate regex", () => {
    expect(() =>
      withPathParameters("/x/{v}", { v: "y" }, { interpolate: /\{(?<name>.+?)\}/u }),
    ).toThrow(TypeError);
  });
  it("prototype pollution: __proto__ / constructor are not resolved from own props", () => {
    // No __proto__ own key on the params object → fall through onMissing.
    expect(withPathParameters("/x/{__proto__}", {})).toBe("/x/{__proto__}");
    expect(withPathParameters("/x/{constructor}", {})).toBe("/x/{constructor}");
  });

  it("resets a reused global interpolate regex before substitution", () => {
    const interpolate = /\{(?<name>[\s\S]+?)\}/gu;
    interpolate.lastIndex = 999;
    expect(withPathParameters("/x/{v}/{w}", { v: "a/b", w: "c d" }, { interpolate })).toBe(
      "/x/a%2Fb/c%20d",
    );
    expect(interpolate.lastIndex).toBe(0);
  });

  it("custom interpolate without a capture leaves the matched text untouched", () => {
    expect(withPathParameters("/x/{v}", { v: "y" }, { interpolate: /\{v\}/gu })).toBe("/x/{v}");
  });

  it("own undefined values leave placeholders unchanged instead of stringifying undefined", () => {
    const parameters: Record<string, string | number> = {};
    Object.defineProperty(parameters, "v", { enumerable: true, value: undefined });
    expect(withPathParameters("/x/{v}", parameters)).toBe("/x/{v}");
  });
});
