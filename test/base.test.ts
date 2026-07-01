import { describe, expect, it, test } from "vitest";
import { withBase, withoutBase } from "../src";

describe("withBase", () => {
  const tests = [
    { base: "/", input: "/", out: "/" },
    { base: "/foo", input: "", out: "/foo" },
    { base: "/foo/", input: "/", out: "/foo" },
    { base: "/foo", input: "/bar", out: "/foo/bar" },
    { base: "/base/", input: "/base", out: "/base" },
    { base: "/base", input: "/base/", out: "/base/" },
    { base: "/base", input: "/base/a", out: "/base/a" },
    { base: "/base/", input: "/base/a", out: "/base/a" },
    { base: "/base/", input: "https://test.com", out: "https://test.com" },
    { base: "/", input: "https://test.com", out: "https://test.com" },
    {
      base: "/admin/",
      input: "/admin-dashboard",
      out: "/admin/admin-dashboard",
    },
    {
      base: "/admin/",
      input: "/admin/admin-dashboard",
      out: "/admin/admin-dashboard",
    },
    {
      base: "/admin",
      input: "/admin-dashboard",
      out: "/admin/admin-dashboard",
    },
    { base: "/admin/", input: "/admin/dashboard", out: "/admin/dashboard" },
  ];

  for (const t of tests) {
    test(JSON.stringify(t.base) + " + " + JSON.stringify(t.input), () => {
      expect(withBase(t.input, t.base)).toBe(t.out);
    });
  }
});

describe("withoutBase", () => {
  const tests = [
    { base: "/", input: "/", out: "/" },
    { base: "/foo", input: "/", out: "/" },
    { base: "/foo/", input: "/", out: "/" },
    { base: "/foo", input: "/bar", out: "/bar" },
    { base: "/base/", input: "/base", out: "/" },
    { base: "/base", input: "/base/", out: "/" },
    { base: "/base", input: "/base/a", out: "/a" },
    { base: "/base/", input: "/base/a", out: "/a" },
    { base: "/base/a/", input: "/base/a", out: "/" },
    { base: "/", input: "/test/", out: "/test/" },
    { base: "/", input: "/?test", out: "/?test" },
    { base: "/api", input: "/api?test", out: "/?test" },
    { base: "/base/", input: "https://test.com", out: "https://test.com" },
    { base: "/", input: "https://test.com", out: "https://test.com" },
    { base: "/admin/", input: "/admin-dashboard", out: "/admin-dashboard" },
    {
      base: "/admin/",
      input: "/admin/admin-dashboard",
      out: "/admin-dashboard",
    },
    { base: "/admin", input: "/admin-dashboard", out: "/admin-dashboard" },
    { base: "/admin/", input: "/admin/dashboard", out: "/dashboard" },
    // Collapse leading "//" to prevent protocol-relative URL injection
    { base: "/legacy", input: "/legacy//evil.com", out: "/evil.com" },
    { base: "/legacy/", input: "/legacy//evil.com", out: "/evil.com" },
    { base: "/legacy", input: "/legacy///evil.com", out: "/evil.com" },
    { base: "/legacy", input: "/legacy//", out: "/" },
  ];

  for (const t of tests) {
    test(JSON.stringify(t.input) + "-" + JSON.stringify(t.base), () => {
      expect(withoutBase(t.input, t.base)).toBe(t.out);
    });
  }
});

describe("withBase — fragment characterization", () => {
  it("keeps query-string handling intact (control)", () => {
    // Control — proves the "already has base" check works for the ?query case.
    // Plan 006 must NOT regress this while fixing the # case.
    expect(withBase("/foo?q=1", "/foo")).toBe("/foo?q=1");
  });

  // FIXME(CORR-02): plan 006 changes this to "/foo#h" (base already present,
  // fragment must not defeat the base-match check). Today the "#" character
  // breaks the base-startsWith comparison and the base is prefixed a second
  // time. See src/utils.ts (withBase).
  it("currently double-prefixes the base when a fragment is present (buggy — see FIXME)", () => {
    expect(withBase("/foo#h", "/foo")).toBe("/foo/foo#h");
  });
});

describe("withoutBase — fragment characterization", () => {
  it("strips base from a path with a query string (control)", () => {
    // Control — plan 006 must NOT regress this while fixing the # case.
    expect(withoutBase("/foo?q=1", "/foo")).toBe("/?q=1");
  });

  // FIXME(CORR-04): plan 006 changes this to "/#h" (base stripped, fragment
  // preserved). Today the "#" defeats the base-match check and the input is
  // returned unchanged. See src/utils.ts (withoutBase).
  it("currently fails to strip base when a fragment is present (buggy — see FIXME)", () => {
    expect(withoutBase("/foo#h", "/foo")).toBe("/foo#h");
  });
});

// SEC-02 — withBase must not passthrough a protocol-relative input when base is empty/'/'.
// Test strings model the attack pattern; no rendering side-effect is invoked.
describe("withBase — SEC-02 leading '//' normalization", () => {
  test("empty base + '//' input: collapses leading '//' to '/'", () => {
    expect(withBase("//attacker.com/x", "")).toBe("/attacker.com/x");
  });
  test("'/' base + '//' input: collapses leading '//' to '/'", () => {
    expect(withBase("//attacker.com/x", "/")).toBe("/attacker.com/x");
  });
  test("proper base + '//' input still joins safely", () => {
    expect(withBase("//attacker.com/x", "/app")).toBe("/app/attacker.com/x");
  });
  test("protocol-carrying input is unaffected (no regression)", () => {
    expect(withBase("https://a.com", "/foo")).toBe("https://a.com");
  });
  test("escape hatch: { allowProtocolRelative: true } preserves '//'", () => {
    expect(
      withBase("//attacker.com/x", "/", { allowProtocolRelative: true }),
    ).toBe("//attacker.com/x");
  });
});
