import { describe, expect, it, test } from "vitest";
import {
  parseURL,
  parseHost,
  parseFilename,
  parseAuth,
  isScriptProtocol,
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
  describe("SEC-03/SEC-04 pinned buggy baseline (to be flipped)", () => {
    it("SEC-03a: digit-leading scheme is (wrongly) accepted", () => {
      expect(parseURL("123://foo.com/x").protocol).toBe("123:");
    });
    it("SEC-03b: non-special scheme backslash is (wrongly) normalized", () => {
      expect(parseURL("git://a\\b/x").host).toBe("a");
    });
    it("SEC-04: multi-@ authority (wrongly) keeps second @ in host", () => {
      expect(parseURL("http://foo@bar@example.com/x").host).toBe(
        "bar@example.com",
      );
    });
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

describe("parseHost — IPv6 (characterization)", () => {
  it("parses an IPv4-style host:port control case correctly", () => {
    // Control — proves parseHost works for the non-IPv6 path.
    // If this ever fails, do NOT edit it here — it means a fix in src/parse.ts
    // regressed the non-IPv6 case, which is a separate bug.
    expect(parseHost("example.com:8080")).toStrictEqual({
      hostname: "example.com",
      port: "8080",
    });
  });

  // FIXME(CORR-01): plan 005 changes these to correctly extract the bracketed
  // IPv6 address and (if present) the port after the closing bracket. Today
  // parseHost splits on the first ":", which is inside the address.
  // Expected after plan 005 (for reference — do NOT assert this yet):
  //   parseHost("[::1]:8080")           -> { hostname: "::1", port: "8080" }
  //   parseHost("[::1]")                -> { hostname: "::1" }
  //   parseHost("[2001:db8::1]:443")    -> { hostname: "2001:db8::1", port: "443" }
  // See src/parse.ts. When plan 005 lands, update these expected values and
  // remove the FIXME markers.
  it("currently mangles [::1]:8080 (buggy — see FIXME)", () => {
    expect(parseHost("[::1]:8080")).toStrictEqual({
      hostname: "[",
      port: undefined,
    });
  });

  it("currently mangles [::1] with no port (buggy — see FIXME)", () => {
    expect(parseHost("[::1]")).toStrictEqual({
      hostname: "[",
      port: undefined,
    });
  });

  it("currently mangles [2001:db8::1]:443 (buggy — see FIXME)", () => {
    expect(parseHost("[2001:db8::1]:443")).toStrictEqual({
      hostname: "[2001",
      port: undefined,
    });
  });
});
