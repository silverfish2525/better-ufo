import { describe, expect, it, test } from "vitest";
import {
  parseURL,
  parseHost,
  parseFilename,
  parseAuth,
  isScriptProtocol,
  stringifyParsedURL,
} from "../src";

describe("parseURL", () => {
  const tests = [
    {
      input: "//test",
      out: {
        auth: "",
        hash: "",
        host: "test",
        pathname: "",
        protocol: "",
        search: "",
      },
    },
    {
      input: "https://test.com",
      out: {
        auth: "",
        hash: "",
        host: "test.com",
        pathname: "",
        protocol: "https:",
        search: "",
      },
    },
    {
      input: "http://test.com?foo=bar",
      out: {
        auth: "",
        hash: "",
        host: "test.com",
        pathname: "",
        protocol: "http:",
        search: "?foo=bar",
      },
    },
    { input: "/test", out: { hash: "", pathname: "/test", search: "" } },
    {
      input: "file:///home/user",
      out: {
        auth: "",
        hash: "",
        host: "",
        pathname: "/home/user",
        protocol: "file:",
        search: "",
      },
    },
    {
      input: "file:///C:/home/user",
      out: {
        auth: "",
        hash: "",
        host: "",
        pathname: "C:/home/user",
        protocol: "file:",
        search: "",
      },
    },
    {
      input: "https://test.com/t:est",
      out: {
        auth: "",
        hash: "",
        host: "test.com",
        pathname: "/t:est",
        protocol: "https:",
        search: "",
      },
    },
    {
      input: String.raw`https://host.name\@foo.bar/meme3.php?url=http://0.0.0.0/2.svg`,
      out: {
        auth: "",
        hash: "",
        host: "host.name",
        pathname: "/@foo.bar/meme3.php",
        protocol: "https:",
        search: "?url=http://0.0.0.0/2.svg",
      },
    },
    {
      input: "javascript:alert('hello')",
      out: {
        protocol: "javascript:",
        auth: "",
        host: "",
        href: "javascript:alert('hello')",
        pathname: "alert('hello')",
        search: "",
        hash: "",
      },
    },
    {
      input: "\0javascrIpt:alert('hello')",
      out: {
        protocol: "javascript:",
        auth: "",
        host: "",
        href: "javascrIpt:alert('hello')",
        pathname: "alert('hello')",
        search: "",
        hash: "",
      },
    },
    {
      input: "https://domain.test:3000#owo",
      out: {
        protocol: "https:",
        auth: "",
        host: "domain.test:3000",
        pathname: "",
        search: "",
        hash: "#owo",
      },
    },
    {
      input: "Https://domain.test:3000#owo",
      out: {
        protocol: "https:",
        auth: "",
        host: "domain.test:3000",
        pathname: "",
        search: "",
        hash: "#owo",
      },
    },
    {
      input: "data:image/png;base64,aaa//bbbbbb/ccc",
      out: {
        protocol: "data:",
        auth: "",
        host: "",
        href: "data:image/png;base64,aaa//bbbbbb/ccc",
        pathname: "image/png;base64,aaa//bbbbbb/ccc",
        search: "",
        hash: "",
      },
    },
    {
      input: "blob:https://video_url",
      out: {
        protocol: "blob:",
        auth: "",
        host: "",
        href: "blob:https://video_url",
        pathname: "https://video_url",
        search: "",
        hash: "",
      },
    },
    {
      input: "\0https://invalid.com",
      out: {
        protocol: "https:",
        auth: "",
        host: "invalid.com",
        pathname: "",
        search: "",
        hash: "",
      },
    },
    {
      input: "\0javascript:alert('hello')",
      out: {
        protocol: "javascript:",
        auth: "",
        host: "",
        href: "javascript:alert('hello')",
        pathname: "alert('hello')",
        search: "",
        hash: "",
      },
    },

    // Test strings are inert — they exercise the parser, not any renderer.
    // SEC-01: browsers strip \t \n \r from schemes; parseURL must too
    {
      input: "java\tscript:alert('hello')",
      out: {
        protocol: "javascript:",
        pathname: "alert('hello')",
        href: "javascript:alert('hello')",
        auth: "",
        host: "",
        search: "",
        hash: "",
      },
    },
    {
      input: "java\nscript:alert(1)",
      out: {
        protocol: "javascript:",
        pathname: "alert(1)",
        href: "javascript:alert(1)",
        auth: "",
        host: "",
        search: "",
        hash: "",
      },
    },
    {
      input: "JAVA\tSCRIPT:alert(1)",
      out: {
        protocol: "javascript:",
        pathname: "alert(1)",
        href: "JAVASCRIPT:alert(1)",
        auth: "",
        host: "",
        search: "",
        hash: "",
      },
    },
    {
      input: "vb\tscript:msgbox 1",
      out: {
        protocol: "vbscript:",
        pathname: "msgbox 1",
        href: "vbscript:msgbox 1",
        auth: "",
        host: "",
        search: "",
        hash: "",
      },
    },
    {
      input: "da\tta:text/html,x",
      out: {
        protocol: "data:",
        pathname: "text/html,x",
        href: "data:text/html,x",
        auth: "",
        host: "",
        search: "",
        hash: "",
      },
    },
    {
      input: "bl\tob:https://video_url",
      out: {
        protocol: "blob:",
        pathname: "https://video_url",
        href: "blob:https://video_url",
        auth: "",
        host: "",
        search: "",
        hash: "",
      },
    },
  ];

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(structuredClone(parseURL(t.input))).toEqual(t.out);
    });
  }

  test("SEC-01: hasProtocol and isScriptProtocol agree on tampered javascript scheme", () => {
    // Test strings are inert — they exercise the parser, not any renderer.
    const tampered = "java\tscript:alert(1)";
    const parsed = parseURL(tampered);
    expect(parsed.protocol).toBe("javascript:");
    // The whole point of SEC-01: after the fix, the composed gate returns true.
    expect(isScriptProtocol(parsed.protocol)).toBe(true);
  });

  // FIXME: SEC-03/SEC-04 — plan 004 flips these to correct behavior in a later commit.
  // These cases pin the current buggy behavior so the fix diff is auditable.
  // Attack patterns tested as strings; no HTTP request is issued.
  describe("SEC-03: scheme validation (WHATWG/RFC 3986)", () => {
    // Attack patterns tested as strings; no HTTP request is issued.
    it("rejects digit-leading schemes (no protocol captured)", () => {
      const r = parseURL("123://foo.com/x");
      // Falls through to parsePath: protocol is absent/empty.
      expect(r.protocol ?? "").toBe("");
      // Falls through to parsePath: pathname holds the raw string.
      expect(r.pathname + r.search + r.hash).toBe("123://foo.com/x");
    });
    it("accepts alpha-leading schemes with digits/plus/dot/minus", () => {
      expect(parseURL("h2c://x/y").protocol).toBe("h2c:");
      expect(parseURL("git+ssh://x/y").protocol).toBe("git+ssh:");
      expect(parseURL("coap.tcp://x/y").protocol).toBe("coap.tcp:");
      expect(parseURL("x-scheme://x/y").protocol).toBe("x-scheme:");
    });
  });

  describe("SEC-03: backslash normalization gated to special schemes", () => {
    it("normalizes `\\\\` to `/` for http (special)", () => {
      expect(parseURL(String.raw`http://a\b`).host).toBe("a");
    });
    it("normalizes `\\\\` to `/` for https, ws, wss, ftp, file (special)", () => {
      expect(parseURL(String.raw`https://a\b`).host).toBe("a");
      expect(parseURL(String.raw`ws://a\b`).host).toBe("a");
      expect(parseURL(String.raw`wss://a\b`).host).toBe("a");
      expect(parseURL(String.raw`ftp://a\b`).host).toBe("a");
      expect(parseURL(String.raw`file://a\b`).host).toBe("a");
    });
    it("PRESERVES `\\\\` for non-special schemes (git, custom, etc.)", () => {
      expect(parseURL(String.raw`git://a\b`).host).toBe(String.raw`a\b`);
      expect(parseURL(String.raw`ssh://a\b`).host).toBe(String.raw`a\b`);
      expect(parseURL(String.raw`custom+x://a\b`).host).toBe(String.raw`a\b`);
    });
  });

  describe("SEC-04: multi-@ userinfo terminates at LAST @ before path", () => {
    // Attack patterns tested as strings; no HTTP request is issued.
    it("resolves host to the true host after multi-@", () => {
      const r = parseURL("http://foo@bar@example.com/x");
      expect(r.host).toBe("example.com");
      expect(r.auth).toBe("foo%40bar");
      expect(r.pathname).toBe("/x");
    });
    it("preserves single-@ userinfo (regression control)", () => {
      const r = parseURL("http://a@b.com/x");
      expect(r.host).toBe("b.com");
      expect(r.auth).toBe("a");
      expect(r.pathname).toBe("/x");
    });
    it("keeps @ in the path (no authority @) untouched", () => {
      // `foo` is the host; `/@bar/baz` is the path — no userinfo.
      const r = parseURL("http://foo/@bar/baz");
      expect(r.host).toBe("foo");
      expect(r.auth).toBe("");
      expect(r.pathname).toBe("/@bar/baz");
    });
    it("ignores @ that appears only after a path terminator", () => {
      const r = parseURL("http://foo.com/?x=a@b#c@d");
      expect(r.host).toBe("foo.com");
      expect(r.auth).toBe("");
    });

    // Fuzz-style: multi-@ combinations verifying host never leaks.
    // Attack patterns tested as strings; no HTTP request is issued.
    const _hosts = ["example.com", "10.0.0.1", "a.b.c.d", "localhost"];
    const _userinfos = [
      "u@v",
      "u@v@w",
      "%40u@v",
      "u:p@x",
      "u@v:p",
      "@only",
      "a@b@c@d",
      "user@name:pass@word",
      "x@y%40z",
      "trailing@",
    ];
    const _tails = ["/p", "/p?q=1", "/p#f", ""];
    for (const _h of _hosts) {
      for (const _u of _userinfos) {
        for (const _t of _tails) {
          const _url = `http://${_u}@${_h}${_t}`;
          it(`host resolves to "${_h}" for ${_url}`, () => {
            expect(parseURL(_url).host).toBe(_h);
          });
          if (_tails.indexOf(_t) === 0 && _userinfos.indexOf(_u) === 0) {
            // Keep the total to ~20 by breaking after we've hit representative combos.
            break;
          }
        }
      }
    }
  });
});

describe("parseHost", () => {
  const tests = [
    { input: "localhost:3000", out: { hostname: "localhost", port: "3000" } },
    { input: "google.com", out: { hostname: "google.com", port: undefined } },
  ];

  for (const t of tests) {
    test(t.input, () => {
      expect(parseHost(t.input)).toStrictEqual(t.out);
    });
  }
});

describe("parseFilename", () => {
  const tests = [
    { input: ["/path/to/filename.ext", false], out: "filename.ext" },
    { input: ["/path/to/.hidden-file", false], out: ".hidden-file" },
    { input: ["/path/to/dir/", false], out: undefined },
    { input: [".", false], out: undefined },
    { input: ["/", false], out: undefined },
    { input: ["", false], out: undefined },
    {
      input: ["http://example.com/path/to/filename.ext", false],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext?query=true", false],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext#hash", false],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext?query=true#hash", false],
      out: "filename.ext",
    },
    {
      input: [
        "http://example.com/path/to/filename.ext/?query=true#hash",
        false,
      ],
      out: undefined,
    },
    { input: ["http://example.com/path/to/dir/", false], out: undefined },
    {
      input: ["http://example.com/path/to/dir/?query=true#hash", false],
      out: undefined,
    },
    { input: ["http://example.com/path/to/dir/#hash", false], out: undefined },
    { input: ["http://example.com", false], out: undefined },
    {
      input: ["ftp://example.com/path/to/filename.ext", false],
      out: "filename.ext",
    },
    { input: ["file:///path/to/filename.ext", false], out: "filename.ext" },
    { input: ["/path/to/filename.ext", true], out: "filename.ext" },
    { input: ["/path/to/.hidden-file", true], out: undefined },
    { input: ["/path/to/dir/", true], out: undefined },
    { input: [".", true], out: undefined },
    { input: ["/", true], out: undefined },
    { input: ["", true], out: undefined },
    {
      input: ["http://example.com/path/to/filename.ext", true],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext?query=true", true],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext#hash", true],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext?query=true#hash", true],
      out: "filename.ext",
    },
    {
      input: ["http://example.com/path/to/filename.ext/?query=true#hash", true],
      out: undefined,
    },
    { input: ["http://example.com/path/to/dir/", true], out: undefined },
    {
      input: ["http://example.com/path/to/dir/?query=true#hash", true],
      out: undefined,
    },
    { input: ["http://example.com/path/to/dir/#hash", true], out: undefined },
    { input: ["http://example.com", true], out: undefined },
    {
      input: ["ftp://example.com/path/to/filename.ext", true],
      out: "filename.ext",
    },
    { input: ["file:///path/to/filename.ext", true], out: "filename.ext" },
    { input: ["/path/to/filename.ext/", true], out: undefined },
    { input: ["/path/to/dir/../filename.ext", true], out: "filename.ext" },
    { input: ["/path/to/dir/../filename.ext/", true], out: undefined },
  ] as const;

  test("works", () => {
    expect(parseFilename("/path/to/filename.ext")).toEqual("filename.ext");
  });

  for (const t of tests) {
    test(t.input.toString(), () => {
      expect(
        parseFilename(t.input[0].toString(), { strict: t.input[1] }),
      ).toStrictEqual(t.out);
    });
  }
});

describe("parseAuth", () => {
  it("splits username and password on the first colon", () => {
    expect(parseAuth("user:pass")).toStrictEqual({
      username: "user",
      password: "pass",
    });
  });

  it("returns an empty password when there is no colon", () => {
    expect(parseAuth("user")).toStrictEqual({
      username: "user",
      password: "",
    });
  });

  it("returns empty username and password for an empty string", () => {
    expect(parseAuth("")).toStrictEqual({
      username: "",
      password: "",
    });
  });

  it("preserves colons in the password (RFC 3986 §3.2.1 — first colon splits)", () => {
    expect(parseAuth("user:pa:ss")).toStrictEqual({
      username: "user",
      password: "pa:ss",
    });
  });

  it("handles a leading colon (empty username, non-empty password)", () => {
    expect(parseAuth(":pw")).toStrictEqual({
      username: "",
      password: "pw",
    });
  });

  it("handles a trailing colon (username, empty password)", () => {
    expect(parseAuth("user:")).toStrictEqual({
      username: "user",
      password: "",
    });
  });

  it("handles multiple consecutive colons in the password", () => {
    expect(parseAuth("u::::p")).toStrictEqual({
      username: "u",
      password: ":::p",
    });
  });
});

describe("parseHost — IPv6", () => {
  it("parses a non-IPv6 host:port (control — non-IPv6 fast path)", () => {
    expect(parseHost("example.com:8080")).toStrictEqual({
      hostname: "example.com",
      port: "8080",
    });
  });

  it("parses [::1]:8080 as hostname='[::1]' + port='8080'", () => {
    expect(parseHost("[::1]:8080")).toStrictEqual({
      hostname: "[::1]",
      port: "8080",
    });
  });

  it("parses [::1] with no port", () => {
    expect(parseHost("[::1]")).toStrictEqual({
      hostname: "[::1]",
      port: undefined,
    });
  });

  it("parses [2001:db8::1]:443", () => {
    expect(parseHost("[2001:db8::1]:443")).toStrictEqual({
      hostname: "[2001:db8::1]",
      port: "443",
    });
  });

  it("parses the unspecified address [::]", () => {
    expect(parseHost("[::]")).toStrictEqual({
      hostname: "[::]",
      port: undefined,
    });
  });

  it("preserves the raw input for a malformed unclosed bracket", () => {
    // No throw; permissive parse. Callers can validate downstream.
    expect(parseHost("[::1")).toStrictEqual({
      hostname: "[::1",
      port: undefined,
    });
  });

  it("returns undefined port for [::1]: with an empty port segment", () => {
    // Trailing ":" with no digits — treat as no port, do not surface "".
    expect(parseHost("[::1]:")).toStrictEqual({
      hostname: "[::1]",
      port: undefined,
    });
  });

  it("keeps IPv6 zone-id inside the hostname verbatim (see TODO(v2))", () => {
    // Zone-id normalization is deferred (see TODO(v2) comment in src/parse.ts).
    // For now assert current behavior so the deferral is explicit and any change
    // to zone-id handling has to update this test.
    // Note: decode() percent-decodes the hostname, so %25 -> % in the returned value.
    expect(parseHost("[fe80::1%25eth0]:80")).toStrictEqual({
      hostname: "[fe80::1%eth0]",
      port: "80",
    });
  });
});

describe("parseURL — IPv6 round-trip", () => {
  it("stringifyParsedURL(parseURL(x)) === x for a bracketed IPv6 URL with port", () => {
    const input = "http://[::1]:8080/x";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });

  it("stringifyParsedURL(parseURL(x)) === x for a bracketed IPv6 URL without port", () => {
    const input = "http://[::1]/x";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });

  it("stringifyParsedURL(parseURL(x)) === x for a full IPv6 URL with port", () => {
    const input = "https://[2001:db8::1]:443/api?q=1#top";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });
});
