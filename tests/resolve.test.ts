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
