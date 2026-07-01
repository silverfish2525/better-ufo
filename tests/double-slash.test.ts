import { describe, expect, it } from "vitest";
import { cleanDoubleSlashes } from "../src";

describe("cleanDoubleSlashes", () => {
  const tests: Record<string, string> = {
    "//foo//bar//": "/foo/bar/",
    "http://foo.com//": "http://foo.com/",
    "http://foo.com/bar//foo/": "http://foo.com/bar/foo/",
    "http://example.com/analyze//http://localhost:3000//":
      "http://example.com/analyze/http://localhost:3000/",
  };

  for (const input in tests) {
    it(input, () => {
      expect(cleanDoubleSlashes(input)).toBe(tests[input]);
    });
  }

  it("no input", () => {
    expect(cleanDoubleSlashes()).toBe("");
  });
});

describe("cleanDoubleSlashes preserves query and fragment", () => {
  const tests: Record<string, string> = {
    "/a//b?x//y": "/a/b?x//y",
    "/a//b#x//y": "/a/b#x//y",
    "/a//b?x//y#z//w": "/a/b?x//y#z//w",
    "/a//b?x=1//2&y=3": "/a/b?x=1//2&y=3",
    "http://foo.com//path//x?q//v#h//h": "http://foo.com/path/x?q//v#h//h",
  };
  for (const input in tests) {
    it(input, () => {
      expect(cleanDoubleSlashes(input)).toBe(tests[input]);
    });
  }
});
