import { describe, expect, it } from "vite-plus/test";
import { resolveURL } from "../src";

describe("resolveURL", () => {
  it.each([
    { input: [], out: "" },
    { input: ["/"], out: "/" },
    { input: ["/a"], out: "/a" },
    { input: ["a", "b"], out: "a/b" },
    { input: ["a", "b/", "c"], out: "a/b/c" },
    { input: ["a", "b/", "/c"], out: "a/b/c" },
    { input: ["/a?foo=bar#123", "b/", "c/"], out: "/a/b/c/?foo=bar#123" },
    { input: ["http://foo.com", "a"], out: "http://foo.com/a" },
    { input: ["a?x=1", "b?y=2&y=3&z=4"], out: "a/b?x=1&y=2&y=3&z=4" },
    { input: ["/a", "b?x=1"], out: "/a/b?x=1" },
    { input: ["/a#old", "b#new"], out: "/a/b#new" },
    { input: ["/a#old", "b#"], out: "/a/b#old" },
  ])("$input -> $out", (t) => {
    expect(resolveURL(...t.input)).toBe(t.out);
  });

  it("invalid URL (null)", () => {
    // @ts-expect-error - null rejected at runtime; test verifies the throw path.
    expect(() => resolveURL(null)).toThrow("URL input should be string received object (null)");
  });

  it("invalid URL (array)", () => {
    // @ts-expect-error - array rejected at runtime; test verifies the throw path.
    expect(() => resolveURL([])).toThrow("URL input should be string received object ()");
  });

  it("no arguments", () => {
    expect(resolveURL()).toBe("");
  });
});

describe("resolveURL — branch coverage", () => {
  it("appends search-only segment (no pathname) without extending path", () => {
    // Covers the false branch of `if (urlSegment.pathname)` in resolveURL —
    // The segment has only a search component.
    expect(resolveURL("/a", "?q=1")).toBe("/a?q=1");
  });

  it("appends hash-only segment (no pathname) without extending path", () => {
    // Covers the same false branch with a hash-only segment.
    expect(resolveURL("/a", "#hash")).toBe("/a#hash");
  });

  it("empties the merged query when both sides stringify to nothing", () => {
    // Covers the false branch of `queryString.length > 0 ? '?…' : ''`.
    // `__proto__` is filtered out by parseQuery's prototype-pollution guard,
    // So both parsed inputs are empty objects and the merged result is "".
    expect(resolveURL("/a?__proto__=1", "b?__proto__=2")).toBe("/a/b");
  });
});
