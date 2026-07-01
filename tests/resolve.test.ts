import { describe, expect, it } from "vitest";
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
  ])("$input -> $out", (t) => {
    expect(resolveURL(...t.input)).toBe(t.out);
  });

  it("invalid URL (null)", () => {
    expect(() => resolveURL(null as any)).toThrow(
      "URL input should be string received object (null)",
    );
  });

  it("invalid URL (array)", () => {
    expect(() => resolveURL([] as unknown as string)).toThrow(
      "URL input should be string received object ()",
    );
  });

  it("no arguments", () => {
    expect(resolveURL()).toBe("");
  });
});
