import { describe, expect, it } from "vite-plus/test";
import { $URL, createURL } from "../src";
import type { QueryObject } from "../src";

describe("$URL", () => {
  it("getters", () => {
    const inputURL = "https://john:doe@example.com:1080/path?query=value&v=1&v=2#hash";
    const url = new $URL(inputURL);

    expect(url.href).toStrictEqual(inputURL);
    expect(url.toString()).toStrictEqual(url.href);
    expect(url.toJSON()).toStrictEqual(url.href);

    expect(url.searchParams.toString()).toBe("query=value&v=1&v=2");
    expect(url.query).toMatchObject({ query: "value", v: ["1", "2"] });
  });

  it("getters — shape", () => {
    const inputURL = "https://john:doe@example.com:1080/path?query=value&v=1&v=2#hash";
    const url = new $URL(inputURL);

    expect(url).toMatchObject({
      auth: "john:doe",
      encodedAuth: "john:doe",
      fullpath: "/path?query=value&v=1&v=2#hash",
      hasProtocol: 6,
      hash: "#hash",
      host: "example.com:1080",
      hostname: "example.com",
      isAbsolute: true,
      origin: "https://example.com:1080",
      password: "doe",
      pathname: "/path",
      port: "1080",
      protocol: "https:",
      search: "?query=value&v=1&v=2",
      username: "john",
    });
  });

  it("searchParams ignores inherited keys and serializes nullish/object array values", () => {
    const url = new $URL("/x");
    const proto: Record<string, string> = { inherited: "bad" };
    const query: QueryObject = {
      item: [undefined, null, { a: 1 }],
      scalar: { b: 2 },
    };
    Object.setPrototypeOf(query, proto);
    url.query = query;
    expect(url.searchParams.toString()).toBe(
      "item=&item=&item=%7B%22a%22%3A1%7D&scalar=%7B%22b%22%3A2%7D",
    );
  });

  it("append", () => {
    const url = new $URL("https://john:doe@example.com:1080/path?query=value#hash");
    const path = new $URL("/newpath?newquery=newvalue#newhash");

    url.append(path);

    expect(url.toString()).toBe(
      "https://john:doe@example.com:1080/path/newpath?query=value&newquery=newvalue#newhash",
    );
  });

  it("throws error if appending with another url with protocol", () => {
    const url = new $URL("https://example.com/path");
    expect(() => {
      url.append(url);
    }).toThrow("Cannot append a URL with protocol");
  });

  describe("constructor errors", () => {
    const tests = [
      {
        input: null,
        out: "URL input should be string received object (null)",
      },
      {
        input: 123,
        out: "URL input should be string received number (123)",
      },
      {
        input: {},
        out: "URL input should be string received object ([object Object])",
      },
    ];

    it.each(tests)("$input throw", (t) => {
      // @ts-expect-error - `tests` intentionally holds non-string inputs (null,
      // Number, plain object) to verify the constructor's runtime type-check.
      expect(() => new $URL(t.input)).toThrow(new TypeError(t.out));
    });
  });

  it("preserves multi-colon userinfo password and percent-encodes on serialization", () => {
    const u = new $URL("http://user:pa:ss@example.com/path");
    expect(u.auth).toBe("user:pa:ss");
    expect(u.username).toBe("user");
    expect(u.password).toBe("pa:ss");
    expect(u.encodedAuth).toBe("user:pa%3Ass");
    // Serialization percent-encodes the colon in the password — this is expected and
    // Matches WHATWG (`new URL("http://user:pa:ss@example.com").href` === same).
    expect(u.href).toBe("http://user:pa%3Ass@example.com/path");
  });

  it("regression: single-colon userinfo unchanged", () => {
    const u = new $URL("http://user:pass@example.com/path");
    expect(u.username).toBe("user");
    expect(u.password).toBe("pass");
    expect(u.href).toBe("http://user:pass@example.com/path");
  });
});

describe("$URL — IPv6", () => {
  it("hostname keeps the brackets and port is separated correctly", () => {
    const url = new $URL("http://[::1]:8080/x");
    expect(url.host).toBe("[::1]:8080");
    expect(url.hostname).toBe("[::1]");
    expect(url.port).toBe("8080");
    expect(url.href).toBe("http://[::1]:8080/x");
    expect(url.toString()).toBe(url.href);
  });

  it("hostname keeps the brackets and port is empty when omitted", () => {
    const url = new $URL("http://[::1]/x");
    expect(url.host).toBe("[::1]");
    expect(url.hostname).toBe("[::1]");
    expect(url.port).toBe("");
    expect(url.href).toBe("http://[::1]/x");
  });

  it("full IPv6 with port round-trips through .href", () => {
    const input = "https://[2001:db8::1]:443/api?q=1#top";
    const url = new $URL(input);
    expect(url.hostname).toBe("[2001:db8::1]");
    expect(url.port).toBe("443");
    expect(url.href).toBe(input);
  });
});

describe("$URL — public-field mutation", () => {
  const BASE = "https://john:doe@example.com:1080/path?query=value#hash";

  it("protocol reassignment updates href", () => {
    const url = new $URL("https://example.com/x");
    url.protocol = "http:";
    expect(url.href).toBe("http://example.com/x");
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("host reassignment updates href", () => {
    const url = new $URL(BASE);
    url.host = "other.com";
    expect(url.href).toBe("https://john:doe@other.com/path?query=value#hash");
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("auth reassignment updates href", () => {
    const url = new $URL(BASE);
    url.auth = "user:pass";
    expect(url.href).toBe("https://user:pass@example.com:1080/path?query=value#hash");
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("pathname reassignment updates href", () => {
    const url = new $URL(BASE);
    url.pathname = "/new";
    expect(url.href).toBe("https://john:doe@example.com:1080/new?query=value#hash");
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("hash reassignment updates href", () => {
    const url = new $URL(BASE);
    url.hash = "#new";
    expect(url.href).toBe("https://john:doe@example.com:1080/path?query=value#new");
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("query mutation via property-set is reflected in href", () => {
    const url = new $URL("https://example.com/x?a=1");
    // @ts-expect-error - test probes runtime behavior of assigning a new key
    // To url.query; the declared type does not expose an index signature.
    url.query.b = "2";
    expect(url.href).toBe("https://example.com/x?a=1&b=2");
    expect(url.search).toBe("?a=1&b=2");
  });

  it("query replacement via assignment is reflected in href", () => {
    const url = new $URL("https://example.com/x?a=1");
    url.query = { only: "one" };
    expect(url.href).toBe("https://example.com/x?only=one");
    expect(url.search).toBe("?only=one");
  });
});

describe("$URL — getter-only surface", () => {
  // Characterization: pin that these are getter-only (no setter).
  // If a future PR deliberately adds a setter, this test will fail — update it then.
  const getterOnlyProps = [
    "hostname",
    "port",
    "username",
    "password",
    "search",
    "searchParams",
    "origin",
    "fullpath",
    "encodedAuth",
    "href",
    "hasProtocol",
    "isAbsolute",
  ] as const;

  it.each(getterOnlyProps)("%s is getter-only (prototype descriptor)", (prop) => {
    const desc = Object.getOwnPropertyDescriptor($URL.prototype, prop);
    expect(desc).toBeDefined();
    // eslint-disable-next-line typescript/unbound-method
    expect(desc?.set).toBeUndefined();
    // eslint-disable-next-line typescript/unbound-method
    expect(desc?.get).toBeTypeOf("function");
  });
});

describe("createURL parity", () => {
  const parityInputs = [
    "",
    "/",
    "https://example.com",
    "https://user:pass@example.com:8080/a?b=1#c",
  ];

  it.each(parityInputs)("createURL(%s).href === new $URL(%s).href", (input) => {
    const via = createURL(input);
    const direct = new $URL(input);
    expect(via.href).toBe(direct.href);
    expect(via).toMatchObject({
      hash: direct.hash,
      host: direct.host,
      pathname: direct.pathname,
      protocol: direct.protocol,
    });
  });

  it("createURL for opaque scheme: href equality only", () => {
    // Mailto: is an opaque scheme — just verify href round-trips, no deep struct assert.
    const input = "mailto:a@b.com";
    expect(createURL(input).href).toBe(new $URL(input).href);
  });

  // Protocol-relative: probe showed createURL("//example.com/path").href === "/path"
  // (the "//" authority is dropped because $URL has no setter for it; characterization only).
  it("createURL protocol-relative: characterize current behavior", () => {
    const input = "//example.com/path";
    expect(createURL(input).href).toBe(new $URL(input).href);
  });
});

describe("$URL — edge case constructors", () => {
  it("empty string input", () => {
    const url = new $URL("");
    expect(url.href).toBe("");
    expect(url.protocol).toBe("");
    expect(url.host).toBe("");
    expect(url.pathname).toBe("");
  });

  it("path-only input", () => {
    const url = new $URL("/only-path");
    expect(url.protocol).toBe("");
    expect(url.host).toBe("");
    expect(url.pathname).toBe("/only-path");
    expect(url.hasProtocol).toBe(0);
    // IsAbsolute is truthy because pathname starts with "/"
    expect(url.isAbsolute).toBe(true);
  });

  it("origin-only input (no path)", () => {
    const url = new $URL("https://example.com");
    expect(url.pathname).toBe("");
    expect(url.href).toBe("https://example.com");
  });
});

describe("$URL — branch coverage", () => {
  it("password getter returns '' when auth has no colon (username-only)", () => {
    // Regression: exercises the `|| ""` fallback in the password getter when
    // ParseAuth() surfaces an empty password (no ':' in `auth`).
    const url = new $URL("http://user@example.com/path");
    expect(url.auth).toBe("user");
    expect(url.username).toBe("user");
    expect(url.password).toBe("");
    expect(url.encodedAuth).toBe("user");
    expect(url.href).toBe("http://user@example.com/path");
  });

  it("origin is host-only when protocol is empty", () => {
    // Path-only input has no protocol; origin must NOT prepend "//".
    const url = new $URL("/only/path");
    expect(url.protocol).toBe("");
    expect(url.origin).toBe("");
    const url2 = new $URL("");
    url2.host = "example.com";
    expect(url2.origin).toBe("example.com");
  });

  it("searchParams JSON-serializes non-string, non-array nullish scalars as 'null'", () => {
    // Covers the `?? null` fallback in the else-branch of searchParams
    // (value is not an array; typeof value !== 'string'; value is null/undefined).
    const url = new $URL("/x");
    url.query = { a: null, b: undefined };
    expect(url.searchParams.get("a")).toBe("null");
    expect(url.searchParams.get("b")).toBe("null");
    expect(url.searchParams.toString()).toBe("a=null&b=null");
  });

  it("append is a no-op on pathname when the appended URL has no pathname", () => {
    // Covers the false branch of `if (url.pathname)` inside append().
    const base = new $URL("/base");
    const overlay = new $URL("?q=1");
    expect(overlay.pathname).toBe("");
    base.append(overlay);
    expect(base.pathname).toBe("/base");
    expect(base.href).toBe("/base?q=1");
  });

  it("append is a no-op on hash when the appended URL has no hash", () => {
    // Covers the false branch of `if (url.hash) { … }` inside append().
    const base = new $URL("/base#keep");
    const overlay = new $URL("/extra");
    expect(overlay.hash).toBe("");
    base.append(overlay);
    expect(base.hash).toBe("#keep");
    expect(base.href).toBe("/base/extra#keep");
  });
});
