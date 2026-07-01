import { describe, expect, test } from "vitest";
import { $URL } from "../src";

describe("$URL", () => {
  test("getters", () => {
    const inputURL =
      "https://john:doe@example.com:1080/path?query=value&v=1&v=2#hash";
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

  test("append", () => {
    const url = new $URL(
      "https://john:doe@example.com:1080/path?query=value#hash",
    );
    const path = new $URL("/newpath?newquery=newvalue#newhash");

    url.append(path);

    expect(url.toString()).toEqual(
      "https://john:doe@example.com:1080/path/newpath?query=value&newquery=newvalue#newhash",
    );
  });

  test("throws error if appending with another url with protocol", () => {
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
      test(t.input + " throw", () => {
        expect(() => new $URL(t.input as any)).toThrow(new TypeError(t.out));
      });
    }
  });
});

describe("$URL — IPv6", () => {
  test("hostname keeps the brackets and port is separated correctly", () => {
    const url = new $URL("http://[::1]:8080/x");
    expect(url.host).toBe("[::1]:8080");
    expect(url.hostname).toBe("[::1]");
    expect(url.port).toBe("8080");
    expect(url.href).toBe("http://[::1]:8080/x");
    expect(url.toString()).toBe(url.href);
  });

  test("hostname keeps the brackets and port is empty when omitted", () => {
    const url = new $URL("http://[::1]/x");
    expect(url.host).toBe("[::1]");
    expect(url.hostname).toBe("[::1]");
    expect(url.port).toBe("");
    expect(url.href).toBe("http://[::1]/x");
  });

  test("full IPv6 with port round-trips through .href", () => {
    const input = "https://[2001:db8::1]:443/api?q=1#top";
    const url = new $URL(input);
    expect(url.hostname).toBe("[2001:db8::1]");
    expect(url.port).toBe("443");
    expect(url.href).toBe(input);
  });
});
