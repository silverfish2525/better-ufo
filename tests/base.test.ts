import { describe, expect, it } from "vite-plus/test";
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

  it.each(tests)("$base + $input", (t) => {
    expect(withBase(t.input, t.base)).toBe(t.out);
  });
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

  it.each(tests)("$input-$base", (t) => {
    expect(withoutBase(t.input, t.base)).toBe(t.out);
  });
});

describe("withBase — fragment characterization", () => {
  it("keeps query-string handling intact (control)", () => {
    // Control — proves the "already has base" check works for the ?query case.
    // Plan 006 must NOT regress this while fixing the # case.
    expect(withBase("/foo?q=1", "/foo")).toBe("/foo?q=1");
  });

  it("does not double-prefix the base when a fragment is present", () => {
    expect(withBase("/foo#h", "/foo")).toBe("/foo#h");
  });
});

describe("withoutBase — fragment characterization", () => {
  it("strips base from a path with a query string (control)", () => {
    // Control — plan 006 must NOT regress this while fixing the # case.
    expect(withoutBase("/foo?q=1", "/foo")).toBe("/?q=1");
  });

  it("strips base from a path with a fragment", () => {
    expect(withoutBase("/foo#h", "/foo")).toBe("/#h");
  });
});

describe("withBase / withoutBase — round-trip invariant over path shapes", () => {
  // For a "well-formed" path — one that begins with "/" and has more path depth
  // Than the base — withoutBase(withBase(p, b), b) === p.
  //
  // Cases where p equals b or p is b + only a query/fragment suffix do NOT
  // Satisfy strict equality because withoutBase always prepends "/" (a
  // Compatibility rule locked in by the existing
  // { base: "/api", input: "/api?test", out: "/?test" } test). Those cases are
  // Asserted via a normalized comparison below and are intentionally not part
  // Of the strict matrix. See plan 006 maintenance notes.
  const strictCases: { p: string; b: string }[] = [
    // P does not start with b — withBase prepends, withoutBase strips back cleanly
    { b: "/", p: "/" },
    { b: "/a", p: "/" },
    { b: "/a/b", p: "/" },
    { b: "/", p: "/a" },
    { b: "/a/b", p: "/a" },
    { b: "/", p: "/a?q=1" },
    { b: "/a/b", p: "/a?q=1" },
    { b: "/", p: "/a#f" },
    { b: "/a/b", p: "/a#f" },
    { b: "/", p: "/a?q#f" },
    { b: "/a/b", p: "/a?q#f" },
    { b: "/", p: "/a/b#f" },
  ];

  it.each(strictCases)("round-trip: p=$p, b=$b", ({ p, b }) => {
    expect(withoutBase(withBase(p, b), b)).toBe(p);
  });

  // Documented deviations — when p equals b or p is b + only a suffix (query /
  // Fragment), withoutBase strips the full base and prepends "/", so the result
  // Is NOT equal to p. Asserted so any future refactor that "fixes" this becomes
  // A visible, deliberate breaking change rather than silent drift.
  // See plan 006 maintenance notes and the locked-in test
  // { base: "/api", input: "/api?test", out: "/?test" }.
  it("suffix-only fragment: withoutBase adds a leading slash (documented deviation)", () => {
    expect(withoutBase(withBase("#f", "/a"), "/a")).toBe("/#f");
  });
  it("suffix-only query: withoutBase adds a leading slash (documented deviation)", () => {
    expect(withoutBase(withBase("?q", "/a"), "/a")).toBe("/?q");
  });
  // P equals b: withoutBase reduces to "/"
  it("p equals b: withoutBase returns '/' (documented deviation)", () => {
    expect(withoutBase(withBase("/a", "/a"), "/a")).toBe("/");
  });
  // P is b + query: strips to /?query
  it("p is base + query: withoutBase strips to /?query (documented deviation)", () => {
    expect(withoutBase(withBase("/a?q=1", "/a"), "/a")).toBe("/?q=1");
  });
  // P is b + fragment: strips to /#f
  it("p is base + fragment: withoutBase strips to /#f (documented deviation)", () => {
    expect(withoutBase(withBase("/a#f", "/a"), "/a")).toBe("/#f");
  });
  // P is b + query + fragment: strips to /?query#fragment
  it("p is base + query + fragment: withoutBase strips to /?q#f (documented deviation)", () => {
    expect(withoutBase(withBase("/a?q#f", "/a"), "/a")).toBe("/?q#f");
  });
  // P is b/c + fragment, b is a prefix: withBase keeps, withoutBase strips correctly
  it("p is /a/b#f with base /a: strips to /b#f (documented deviation)", () => {
    expect(withoutBase(withBase("/a/b#f", "/a"), "/a")).toBe("/b#f");
  });
  // P is b + /child + fragment, b is exact: strips to /#f
  it("p is /a/b#f with base /a/b: strips to /#f (documented deviation)", () => {
    expect(withoutBase(withBase("/a/b#f", "/a/b"), "/a/b")).toBe("/#f");
  });
});

// SEC-02 — withBase must not passthrough a protocol-relative input when base is empty/'/'.
// Test strings model the attack pattern; no rendering side-effect is invoked.
describe("withBase — SEC-02 leading '//' normalization", () => {
  it("empty base + '//' input: collapses leading '//' to '/'", () => {
    expect(withBase("//attacker.com/x", "")).toBe("/attacker.com/x");
  });
  it("'/' base + '//' input: collapses leading '//' to '/'", () => {
    expect(withBase("//attacker.com/x", "/")).toBe("/attacker.com/x");
  });
  it("proper base + '//' input still joins safely", () => {
    expect(withBase("//attacker.com/x", "/app")).toBe("/app/attacker.com/x");
  });
  it("protocol-carrying input is unaffected (no regression)", () => {
    expect(withBase("https://a.com", "/foo")).toBe("https://a.com");
  });
  it("escape hatch: { allowProtocolRelative: true } preserves '//'", () => {
    expect(withBase("//attacker.com/x", "/", { allowProtocolRelative: true })).toBe(
      "//attacker.com/x",
    );
  });
});
