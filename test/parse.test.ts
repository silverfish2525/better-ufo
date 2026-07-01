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

  // FIXME(CORR-03): plan 007 changes this to
  //   { username: "user", password: "pa:ss" }
  // Today parseAuth splits on the FIRST ":" and drops the rest ("ss").
  // See src/parse.ts. When plan 007 lands, update this expected value
  // and remove this FIXME.
  it("currently drops content after the second colon (buggy — see FIXME)", () => {
    expect(parseAuth("user:pa:ss")).toStrictEqual({
      username: "user",
      password: "pa",
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
