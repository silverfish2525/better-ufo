import { describe, expect, it } from "vite-plus/test";
import {
  isScriptProtocol,
  parseAuth,
  parseFilename,
  parseHost,
  parseURL,
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
        auth: "",
        hash: "",
        host: "",
        href: "javascript:alert('hello')",
        pathname: "alert('hello')",
        protocol: "javascript:",
        search: "",
      },
    },
    {
      input: "\0javascrIpt:alert('hello')",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "javascrIpt:alert('hello')",
        pathname: "alert('hello')",
        protocol: "javascript:",
        search: "",
      },
    },
    {
      input: "https://domain.test:3000#owo",
      out: {
        auth: "",
        hash: "#owo",
        host: "domain.test:3000",
        pathname: "",
        protocol: "https:",
        search: "",
      },
    },
    {
      input: "Https://domain.test:3000#owo",
      out: {
        auth: "",
        hash: "#owo",
        host: "domain.test:3000",
        pathname: "",
        protocol: "https:",
        search: "",
      },
    },
    {
      input: "data:image/png;base64,aaa//bbbbbb/ccc",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "data:image/png;base64,aaa//bbbbbb/ccc",
        pathname: "image/png;base64,aaa//bbbbbb/ccc",
        protocol: "data:",
        search: "",
      },
    },
    {
      input: "blob:https://video_url",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "blob:https://video_url",
        pathname: "https://video_url",
        protocol: "blob:",
        search: "",
      },
    },
    {
      input: "\0https://invalid.com",
      out: {
        auth: "",
        hash: "",
        host: "invalid.com",
        pathname: "",
        protocol: "https:",
        search: "",
      },
    },
    {
      input: "\0javascript:alert('hello')",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "javascript:alert('hello')",
        pathname: "alert('hello')",
        protocol: "javascript:",
        search: "",
      },
    },

    // Test strings are inert — they exercise the parser, not any renderer.
    // SEC-01: browsers strip \t \n \r from schemes; parseURL must too
    {
      input: "java\tscript:alert('hello')",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "javascript:alert('hello')",
        pathname: "alert('hello')",
        protocol: "javascript:",
        search: "",
      },
    },
    {
      input: "java\nscript:alert(1)",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "javascript:alert(1)",
        pathname: "alert(1)",
        protocol: "javascript:",
        search: "",
      },
    },
    {
      input: "JAVA\tSCRIPT:alert(1)",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "JAVASCRIPT:alert(1)",
        pathname: "alert(1)",
        protocol: "javascript:",
        search: "",
      },
    },
    {
      input: "vb\tscript:msgbox 1",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "vbscript:msgbox 1",
        pathname: "msgbox 1",
        protocol: "vbscript:",
        search: "",
      },
    },
    {
      input: "da\tta:text/html,x",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "data:text/html,x",
        pathname: "text/html,x",
        protocol: "data:",
        search: "",
      },
    },
    {
      input: "bl\tob:https://video_url",
      out: {
        auth: "",
        hash: "",
        host: "",
        href: "blob:https://video_url",
        pathname: "https://video_url",
        protocol: "blob:",
        search: "",
      },
    },
  ];

  it.each(tests)("$input", (t) => {
    expect(structuredClone(parseURL(t.input))).toStrictEqual(t.out);
  });

  it("sEC-01: hasProtocol and isScriptProtocol agree on tampered javascript scheme", () => {
    // Test strings are inert — they exercise the parser, not any renderer.
    const tampered = "java\tscript:alert(1)";
    const parsed = parseURL(tampered);
    expect(parsed.protocol).toBe("javascript:");
    // The whole point of SEC-01: after the fix, the composed gate returns true.
    expect(isScriptProtocol(parsed.protocol)).toBe(true);
  });

  // Known-issue: SEC-03/SEC-04 — plan 004 flips these to correct behavior in a later commit.
  // These cases pin the current buggy behavior so the fix diff is auditable.
  // Attack patterns tested as strings; no HTTP request is issued.
  describe("sEC-03: scheme validation (WHATWG/RFC 3986)", () => {
    // Attack patterns tested as strings; no HTTP request is issued.
    it("rejects digit-leading schemes (no protocol captured)", () => {
      const r = parseURL("123://foo.com/x");
      // Falls through to parsePath: protocol is absent/empty.
      expect(r.protocol).toBeUndefined();
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

  describe("sEC-03: backslash normalization gated to special schemes", () => {
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
    it("pRESERVES `\\` for non-special schemes (git, custom, etc.)", () => {
      expect(parseURL(String.raw`git://a\b`).host).toBe(String.raw`a\b`);
      expect(parseURL(String.raw`ssh://a\b`).host).toBe(String.raw`a\b`);
      expect(parseURL(String.raw`custom+x://a\b`).host).toBe(String.raw`a\b`);
    });
  });

  describe("sEC-04: multi-@ userinfo terminates at LAST @ before path", () => {
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
    const hosts = ["example.com", "10.0.0.1", "a.b.c.d", "localhost"];
    const userinfos = [
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
    const tails = ["/p", "/p?q=1", "/p#f", ""];
    for (const h of hosts) {
      for (const u of userinfos) {
        for (const t of tails) {
          const url = `http://${u}@${h}${t}`;
          it(`host resolves to "${h}" for ${url}`, () => {
            expect(parseURL(url).host).toBe(h);
          });
          if (tails.indexOf(t) === 0 && userinfos.indexOf(u) === 0) {
            // Keep the total to ~20 by breaking after we've hit representative combos.
            break;
          }
        }
      }
    }
    // oxlint-enable vitest/prefer-each
  });

  describe("cORR-06: opaque-scheme URIs (mailto:, tel:, urn:, http:foo, sms:)", () => {
    // RFC 3986 §3: `scheme:opaque-part`. better-ufo surfaces opaque-part as `pathname` (Option A;
    // Matches WHATWG `new URL("mailto:...").pathname`).
    it("populates protocol and pathname for mailto:", () => {
      expect(parseURL("mailto:a@b.com")).toMatchObject({
        auth: "",
        hash: "",
        host: "",
        pathname: "a@b.com",
        protocol: "mailto:",
        search: "",
      });
    });

    it("populates protocol and pathname for tel:", () => {
      expect(parseURL("tel:+1-555-1234")).toMatchObject({
        auth: "",
        hash: "",
        host: "",
        pathname: "+1-555-1234",
        protocol: "tel:",
        search: "",
      });
    });

    it("populates protocol and pathname for urn: (opaque-part may contain colons)", () => {
      expect(parseURL("urn:isbn:0451450523")).toMatchObject({
        auth: "",
        hash: "",
        host: "",
        pathname: "isbn:0451450523",
        protocol: "urn:",
        search: "",
      });
    });

    it("populates protocol and pathname for sms:", () => {
      expect(parseURL("sms:+15551234")).toMatchObject({
        auth: "",
        hash: "",
        host: "",
        pathname: "+15551234",
        protocol: "sms:",
        search: "",
      });
    });

    it("treats scheme-without-slash as opaque (http:foo)", () => {
      expect(parseURL("http:foo")).toMatchObject({
        auth: "",
        hash: "",
        host: "",
        pathname: "foo",
        protocol: "http:",
        search: "",
      });
    });

    it("splits query and fragment from opaque-part when present", () => {
      expect(parseURL("mailto:a@b.com?subject=hi#frag")).toMatchObject({
        auth: "",
        hash: "#frag",
        host: "",
        pathname: "a@b.com",
        protocol: "mailto:",
        search: "?subject=hi",
      });
    });

    // Regression control: hierarchical URLs still parse the same way (host branch, not opaque).
    it("regression: http://foo still hits the hierarchical branch (host = 'foo')", () => {
      expect(parseURL("http://foo")).toMatchObject({
        auth: "",
        host: "foo",
        pathname: "",
        protocol: "http:",
      });
    });

    // Regression control: `_specialProtoMatch` schemes still use their own branch (with .href).
    it("regression: data: still uses the special branch and includes .href", () => {
      const r = parseURL("data:text/plain,x");
      expect(r.protocol).toBe("data:");
      expect(r.pathname).toBe("text/plain,x");
      // The special branch attaches `.href`; the opaque branch does not.
      expect(r.href).toBe("data:text/plain,x");
    });

    // Round-trip: stringifyParsedURL(parseURL(x)) === x for every opaque URL.
    const opaqueRoundtrips = [
      "mailto:a@b.com",
      "tel:+1-555-1234",
      "urn:isbn:0451450523",
      "sms:+15551234",
      "http:foo",
      "data:text/plain,x",
      "mailto:a@b.com?subject=hi#frag",
    ];
    it.each(opaqueRoundtrips)("round-trip: stringifyParsedURL(parseURL(%s)) === input", (url) => {
      expect(stringifyParsedURL(parseURL(url))).toBe(url);
    });
  });
});

describe("parseHost", () => {
  const tests = [
    { input: "localhost:3000", out: { hostname: "localhost", port: "3000" } },
    { input: "google.com", out: { hostname: "google.com", port: undefined } },
  ];

  it.each(tests)("$input", (t) => {
    expect(parseHost(t.input)).toStrictEqual(t.out);
  });
});

describe("parseFilename", () => {
  const tests = [
    { input: ["/path/to/filename.ext", false], out: "filename.ext" },
    { input: ["/path/to/.hidden-file", false], out: ".hidden-file" },
    { input: ["/path/to/dir/", false], out: undefined },
    { input: [".", false], out: "." },
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
      input: ["http://example.com/path/to/filename.ext/?query=true#hash", false],
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

  it("works", () => {
    expect(parseFilename("/path/to/filename.ext")).toBe("filename.ext");
  });

  it.each(tests)("$input", (t) => {
    expect(parseFilename(t.input[0], { strict: t.input[1] })).toStrictEqual(t.out);
  });
});

describe("parseAuth", () => {
  it("splits username and password on the first colon", () => {
    expect(parseAuth("user:pass")).toStrictEqual({
      password: "pass",
      username: "user",
    });
  });

  it("returns an empty password when there is no colon", () => {
    expect(parseAuth("user")).toStrictEqual({
      password: "",
      username: "user",
    });
  });

  it("returns empty username and password for an empty string", () => {
    expect(parseAuth("")).toStrictEqual({
      password: "",
      username: "",
    });
  });

  it("preserves colons in the password (RFC 3986 §3.2.1 — first colon splits)", () => {
    expect(parseAuth("user:pa:ss")).toStrictEqual({
      password: "pa:ss",
      username: "user",
    });
  });

  it("handles a leading colon (empty username, non-empty password)", () => {
    expect(parseAuth(":pw")).toStrictEqual({
      password: "pw",
      username: "",
    });
  });

  it("handles a trailing colon (username, empty password)", () => {
    expect(parseAuth("user:")).toStrictEqual({
      password: "",
      username: "user",
    });
  });

  it("handles multiple consecutive colons in the password", () => {
    expect(parseAuth("u::::p")).toStrictEqual({
      password: ":::p",
      username: "u",
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

  it("decodes percent-encoded IPv6 zone ID in the parsed host", () => {
    // Note: decode() percent-decodes the hostname, so %25 -> % in the returned value.
    expect(parseHost("[fe80::1%25eth0]:80")).toStrictEqual({
      hostname: "[fe80::1%eth0]",
      port: "80",
    });
  });
});

describe("parseHost — CORR-23 anchor", () => {
  it("well-formed host:port unchanged", () => {
    expect(parseHost("foo.com:80")).toStrictEqual({
      hostname: "foo.com",
      port: "80",
    });
  });
  it("bare host unchanged", () => {
    expect(parseHost("foo.com")).toStrictEqual({
      hostname: "foo.com",
      port: undefined,
    });
  });
  it("port with non-numeric suffix no longer silently truncates", () => {
    // Previously: hostname="foo.com", port="80" (dropping "abc").
    // Now: regex fails to anchor, whole input becomes hostname; port undefined.
    expect(parseHost("foo.com:80abc")).toStrictEqual({
      hostname: "foo.com:80abc",
      port: undefined,
    });
  });
  it("empty port suffix returns hostname alone", () => {
    expect(parseHost("foo.com:")).toStrictEqual({
      hostname: "foo.com:",
      port: undefined,
    });
  });
});

describe("parseURL — protocol-relative round-trip", () => {
  it("stringifyParsedURL preserves the leading // authority marker", () => {
    const input = "//cdn.example.com/a?x=1#h";
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
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

describe("sEC-23: whole-input tab/newline strip (WHATWG step 1)", () => {
  it(String.raw`strips \t from host`, () => {
    expect(parseURL("http://a\t.b/").host).toBe("a.b");
  });
  it(String.raw`strips \n from host`, () => {
    expect(parseURL("http://a\n.b/").host).toBe("a.b");
  });
  it(String.raw`strips \r from host`, () => {
    expect(parseURL("http://a\r.b/").host).toBe("a.b");
  });
  it(String.raw`strips \t from pathname`, () => {
    expect(parseURL("http://a.b/foo\tbar").pathname).toBe("/foobar");
  });
  it(String.raw`strips \t from query`, () => {
    expect(parseURL("http://a.b/?x=1\t2").search).toBe("?x=12");
  });
  it(String.raw`strips \t from fragment`, () => {
    expect(parseURL("http://a.b/#foo\tbar").hash).toBe("#foobar");
  });
  it(String.raw`strips \t from scheme (dangerous-scheme fast path unchanged)`, () => {
    expect(parseURL("java\nscript:alert(1)").protocol).toBe("javascript:");
  });
});

describe("parseFilename edge cases", () => {
  const cases: [string, { strict?: boolean } | undefined, string | undefined][] = [
    ["filename.ext", undefined, "filename.ext"],
    ["filename.ext", { strict: true }, "filename.ext"],
    ["/filename.ext", undefined, "filename.ext"],
    ["/a/b.ext", undefined, "b.ext"],
    ["/a/b.ext", { strict: true }, "b.ext"],
    ["a/b.ext", undefined, "b.ext"],
    ["a/b.ext", { strict: true }, "b.ext"],
    ["no-ext", undefined, "no-ext"],
    ["no-ext", { strict: true }, undefined],
    ["", undefined, undefined],
    ["/", undefined, undefined],
  ];
  const labeledCases = cases.map(([input, opts, expected]) => ({
    expected,
    input,
    name: `${JSON.stringify(input)} ${opts?.strict === true ? "(strict)" : ""}`,
    opts,
  }));
  it.each(labeledCases)("$name", ({ input, opts, expected }) => {
    expect(parseFilename(input, opts)).toBe(expected);
  });
});
