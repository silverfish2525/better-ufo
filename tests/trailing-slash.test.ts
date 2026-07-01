import { describe, expect, it } from "vitest";
import { withoutTrailingSlash, withTrailingSlash } from "../src";

describe("withTrailingSlash, queryParams: false", () => {
  const tests: Record<string, string> = {
    "": "/",
    "bar": "bar/",
    "bar#abc": "bar#abc/",
    "bar/": "bar/",
    "foo?123": "foo?123/",
    "foo/?123": "foo/?123/",
    "foo/?123#abc": "foo/?123#abc/",
  };

  for (const input in tests) {
    it(input, () => {
      expect(withTrailingSlash(input)).toBe(tests[input]);
    });
  }

  it("falsy value", () => {
    expect(withTrailingSlash()).toBe("/");
  });
});

describe("withTrailingSlash, queryParams: true", () => {
  const tests: Record<string, string> = {
    "": "/",
    "bar": "bar/",
    "bar/": "bar/",
    "foo?123": "foo/?123",
    "foo/?123": "foo/?123",
    "foo?123#abc": "foo/?123#abc",
    "/#abc": "/#abc",
    "#abc": "#abc",
    "#": "#",
  };

  for (const input in tests) {
    it(input, () => {
      expect(withTrailingSlash(input, true)).toBe(tests[input]);
    });
  }

  it("falsy value", () => {
    expect(withTrailingSlash()).toBe("/");
  });
});

describe("withoutTrailingSlash, queryParams: false", () => {
  const tests: Record<string, string> = {
    "": "/",
    "/": "/",
    "bar": "bar",
    "bar#abc": "bar#abc",
    "bar/#abc": "bar/#abc",
    "foo?123": "foo?123",
    "foo/?123": "foo/?123",
    "foo/?123#abc": "foo/?123#abc",
    "foo/?k=v": "foo/?k=v",
    "foo/?k=/": "foo/?k=",
  };

  for (const input in tests) {
    it(input, () => {
      expect(withoutTrailingSlash(input)).toBe(tests[input]);
    });
  }

  it("falsy value", () => {
    expect(withoutTrailingSlash()).toBe("/");
  });
});

describe("withoutTrailingSlash, queryParams: true", () => {
  const tests: Record<string, string> = {
    "": "/",
    "/": "/",
    "bar": "bar",
    "bar/": "bar",
    "bar#abc": "bar#abc",
    "bar/#abc": "bar#abc",
    "foo?123": "foo?123",
    "foo/?123": "foo?123",
    "foo/?123#abc": "foo?123#abc",
    "foo/?k=123": "foo?k=123",
    "foo?k=/": "foo?k=/",
    "foo/?k=/": "foo?k=/",
    "foo/?k=/&x=y#abc": "foo?k=/&x=y#abc",
    "/a/#abc": "/a#abc",
    "/#abc": "/#abc",
  };

  for (const input in tests) {
    it(input, () => {
      expect(withoutTrailingSlash(input, true)).toBe(tests[input]);
    });
  }

  it("falsy value", () => {
    expect(withoutTrailingSlash()).toBe("/");
  });
});
