import { describe, expect, it } from "vitest";
import { $URL, createURL } from "../src";

describe("$URL", () => {
  it("getters", () => {
    const inputURL
      = "https://john:doe@example.com:1080/path?query=value&v=1&v=2#hash";
    const url = new $URL(inputURL);

    expect(url.href).toEqual(inputURL);
    expect(url.toString()).toEqual(url.href);
    expect(url.toJSON()).toEqual(url.href);

    expect(url.searchParams.toString()).toEqual("query=value&v=1&v=2");
    expect(url.query).toMatchObject({ query: "value", v: ["1", "2"] });

    expect(url).toMatchObject({
      protocol: "https:",
      host: "example.com:1080",
      auth: "john:doe",
      pathname: "/path",
      hash: "#hash",
      hostname: "example.com",
      port: "1080",
      username: "john",
      password: "doe",
      hasProtocol: 6,
      isAbsolute: 6,
      search: "?query=value&v=1&v=2",
      origin: "https://example.com:1080",
      fullpath: "/path?query=value&v=1&v=2#hash",
      encodedAuth: "john:doe",
    });
  });

  it("append", () => {
    const url = new $URL(
      "https://john:doe@example.com:1080/path?query=value#hash",
    );
    const path = new $URL("/newpath?newquery=newvalue#newhash");

    url.append(path);

    expect(url.toString()).toEqual(
      "https://john:doe@example.com:1080/path/newpath?query=value&newquery=newvalue#newhash",
    );
  });

  it("throws error if appending with another url with protocol", () => {
    const url = new $URL("https://example.com/path");
    expect(() => url.append(url)).toThrow("Cannot append a URL with protocol");
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

    for (const t of tests) {
      it(`${String(t.input)} throw`, () => {
        expect(() => new $URL(t.input as string)).toThrow(new TypeError(String(t.out)));
      });
    }
  });

  it("preserves multi-colon userinfo password and percent-encodes on serialization", () => {
    const u = new $URL("http://user:pa:ss@example.com/path");
    expect(u.auth).toBe("user:pa:ss");
    expect(u.username).toBe("user");
    expect(u.password).toBe("pa:ss");
    expect(u.encodedAuth).toBe("user:pa%3Ass");
    // Serialization percent-encodes the colon in the password — this is expected and
    // matches WHATWG (`new URL("http://user:pa:ss@example.com").href` === same).
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
    expect(url.href).toBe(
      "https://user:pass@example.com:1080/path?query=value#hash",
    );
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("pathname reassignment updates href", () => {
    const url = new $URL(BASE);
    url.pathname = "/new";
    expect(url.href).toBe(
      "https://john:doe@example.com:1080/new?query=value#hash",
    );
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("hash reassignment updates href", () => {
    const url = new $URL(BASE);
    url.hash = "#new";
    expect(url.href).toBe(
      "https://john:doe@example.com:1080/path?query=value#new",
    );
    expect(url.toString()).toBe(url.href);
    expect(url.toJSON()).toBe(url.href);
  });

  it("query mutation via property-set is reflected in href", () => {
    const url = new $URL("https://example.com/x?a=1");
    (url.query as Record<string, string>)["b"] = "2";
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

  for (const prop of getterOnlyProps) {
    it(`${prop} is getter-only`, () => {
      const desc
        = Object.getOwnPropertyDescriptor($URL.prototype, prop)
          ?? Object.getOwnPropertyDescriptor(new $URL("https://a.com"), prop);
      expect(desc?.set).toBeUndefined();

      expect(typeof desc?.get).toBe("function");
    });
  }
});

describe("createURL parity", () => {
  const parityInputs = [
    "",
    "/",
    "https://example.com",
    "https://user:pass@example.com:8080/a?b=1#c",
  ];

  for (const input of parityInputs) {
    it(`createURL(${JSON.stringify(input)}).href === new $URL(${JSON.stringify(input)}).href`, () => {
      const via = createURL(input);
      const direct = new $URL(input);
      expect(via.href).toBe(direct.href);
      expect(via).toMatchObject({
        protocol: direct.protocol,
        host: direct.host,
        pathname: direct.pathname,
        hash: direct.hash,
      });
    });
  }

  it("createURL for opaque scheme: href equality only", () => {
    // mailto: is an opaque scheme — just verify href round-trips, no deep struct assert.
    const input = "mailto:a@b.com";
    expect(createURL(input).href).toBe(new $URL(input).href);
  });

  // protocol-relative: probe showed createURL("//example.com/path").href === "/path"
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
    // isAbsolute is truthy because pathname starts with "/"
    expect(url.isAbsolute).toBeTruthy();
  });

  it("origin-only input (no path)", () => {
    // Probe on 6f7a318: new $URL("https://example.com").pathname === ""
    const url = new $URL("https://example.com");
    expect(url.pathname).toBe("");
    expect(url.href).toBe("https://example.com");
  });
});
