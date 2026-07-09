// WPT wire: 100-case subset of special-scheme cases in urltestdata.json.
// NOTE: parseURL(input, defaultProto) does not accept a full base URL; base-relative
// Cases are filtered out (require resolveURL which is plan 006's territory).
// Divergent cases listed in EXPECTED_FAILURES run via it.fails —
import { describe, expect, it } from "vite-plus/test";
import { parseURL } from "../src";
import rawCases from "./fixture/urltestdata.json";

interface WptCase {
  input: string;
  base?: string | null;
  failure?: boolean;
  href?: string;
  protocol?: string;
  host?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
}

const allCases: WptCase[] = (rawCases as readonly unknown[]).filter(
  (c): c is WptCase => typeof c === "object" && c !== null && "input" in c,
);

const SPECIAL_PREFIXES = ["http:", "https:", "ws:", "wss:", "ftp:", "file:"];

const specialCases = allCases.filter(
  (c) =>
    c.failure !== true &&
    typeof c.input === "string" &&
    SPECIAL_PREFIXES.some((p) => c.input.toLowerCase().startsWith(p)),
);

const INITIAL_LIMIT = 100;
const subset = specialCases.slice(0, INITIAL_LIMIT);

const SKIP_LIST: ReadonlySet<string> = new Set<string>();

// When a fix lands, remove the entry and confirm the case passes as plain it().
const EXPECTED_FAILURES: ReadonlySet<string> = new Set<string>([
  // Backslash-in-special-scheme normalization — WPT normalizes \ → /; better-ufo defers to plan 004 gating
  "http:\\\\foo.com\\",
  "http:\\\\a\\b:c\\d@foo.com\\",
  String.raw`http:\\www.google.com\foo`,
  // Tab/newline in host — WPT strips them; better-ufo does not
  "http://example\t.\norg",
  // Empty-password stripping — WPT strips trailing ":" from auth
  "https://test:@test",
  // Empty credentials — WPT strips ":@"
  "https://:@test",
  // Single-slash relative-style — WPT resolves against base; better-ufo treats as opaque
  "http://f:21/ b ? d # e ",
  "http://f:/c",
  "http://f:\n/c",
  "http://f:00000000000000/c",
  "http://f:00000000000000000000080/c",
  "http::@c:29",
  "http://::@c@d:2",
  // IPv6 address normalization
  "http:[61:27]/:foo",
  "http://[2001::1]",
  "http://[::127.0.0.1]",
  "http://[0:0:0:0:0:0:13.1.68.3]",
  "http://[2001::1]:80",
  // Single-slash scheme-specific
  "http:/example.com/",
  "ftp:/example.com/",
  "https:/example.com/",
  "ws:/example.com/",
  "wss:/example.com/",
  // Scheme-relative (no slashes) — WPT resolves against base
  "http:foo.com",
  "http:example.com/",
  "ftp:example.com/",
  "https:example.com/",
  "ws:example.com/",
  "wss:example.com/",
  // File: scheme specifics
  String.raw`file:c:\foo\bar.html`,
  "file://test",
  "file://localhost",
  "file://localhost/",
  "file://localhost/test",
  "file:test",
  // Dot-segment normalization — WPT resolves ./.. etc.; better-ufo does not
  "http://example.com/././foo",
  "http://example.com/./.foo",
  "http://example.com/foo/.",
  "http://example.com/foo/./",
  "http://example.com/foo/bar/..",
  "http://example.com/foo/bar/../",
  "http://example.com/foo/bar/../ton",
  "http://example.com/foo/bar/../ton/../../a",
  "http://example.com/foo/../../..",
  "http://example.com/foo/../../../ton",
  "http://example.com/foo/%2e",
  "http://example.com/foo/%2e./%2e%2e/.%2e/%2e.bar",
  "http://example.com////../..",
  "http://example.com/foo/bar//../..",
  "http://example.com/foo/bar//..",
  // Tab + U+0091 in path (exact bytes from WPT fixture)
  // NB: `\t` is stripped whole-input per WHATWG step 1 (SEC-23);
  // This case still fails because U+0091 handling differs.
  "http://example.com/foo\t\u0091%91",
  // Unicode path normalization
  "http://example.com/\u4F60\u597D\u4F60\u597D",
  "http://example.com/\u2025/foo",
  "http://example.com/\u202E/foo/\u202D/bar",
  // BOM in path
  "http://example.com/\uFEFF/foo",
  // Percent-encoding edge cases (U+00C2 U+00A9 = Latin-1 encoded ©)
  "http://example.com/foo%2\u00C2\u00A9zbar",
  // Hash normalization — WPT expects empty string for bare "#"
  "http://www.google.com/foo?bar=baz#",
  "http://www.google.com/foo?bar=baz# \u00BB",
  // Missing path — WPT adds trailing "/"
  "http://www.google.com",
  // Hex-encoded host
  "http://192.0x00A80001",
  // %2E in path — WPT resolves; better-ufo preserves
  "http://www/foo/%2E/html",
  // Default-port stripping — WPT strips default ports; better-ufo keeps them
  "http://foo:80/",
  "https://foo:443/",
  "ftp://foo:21/",
  "ws://foo:80/",
]);

describe("wPT urltestdata.json (special-scheme subset)", () => {
  for (const c of subset) {
    const label = `${c.input}${c.base !== undefined && c.base !== "" ? ` (base: ${String(c.base)})` : ""}`;

    if (SKIP_LIST.has(c.input)) {
      it.todo(`${label} [known divergence — better-ufo intentionally deviates]`);
      continue;
    }

    const isFailing = EXPECTED_FAILURES.has(c.input);

    const runner = isFailing ? it.fails : it;

    runner(label, () => {
      const parsed = parseURL(c.input);
      if (c.protocol !== undefined) {
        expect(parsed.protocol).toBe(c.protocol);
      }
      if (c.host !== undefined) {
        expect(parsed.host).toBe(c.host);
      }
      if (c.pathname !== undefined) {
        expect(parsed.pathname).toBe(c.pathname);
      }
      if (c.search !== undefined) {
        expect(parsed.search).toBe(c.search);
      }
      if (c.hash !== undefined) {
        expect(parsed.hash).toBe(c.hash);
      }
    });
  }
});
