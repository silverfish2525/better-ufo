import { decode } from "./encoding";
import { hasProtocol, isScriptProtocol, isSpecialScheme } from "./utils";
import type {
  ParsePath as ParsePathType,
  ParseURL,
  ParseFilename,
  Refine,
} from "./_types";

const protocolRelative = Symbol.for("ufo:protocolRelative");

export interface ParsedURL {
  protocol?: string;
  host?: string;
  auth?: string;
  href?: string;
  pathname: string;
  hash: string;
  search: string;
  [protocolRelative]?: boolean;
}

export type ParsedPath = Pick<ParsedURL, "pathname" | "hash" | "search">;

export interface ParsedAuth {
  username: string;
  password: string;
}

export interface ParsedHost {
  hostname: string;
  port: string | undefined;
}

/**
 * Takes a URL string and returns an object with the URL's `protocol`, `auth`, `host`, `pathname`, `search`, and `hash`.
 *
 * @example
 *
 * ```js
 * parseURL("http://foo.com/foo?test=123#token");
 * // { protocol: 'http:', auth: '', host: 'foo.com', pathname: '/foo', search: '?test=123', hash: '#token' }
 *
 * parseURL("foo.com/foo?test=123#token");
 * // { pathname: 'foo.com/foo', search: '?test=123', hash: '#token' }
 *
 * parseURL("foo.com/foo?test=123#token", "https://");
 * // { protocol: 'https:', auth: '', host: 'foo.com', pathname: '/foo', search: '?test=123', hash: '#token' }
 * ```
 *
 * @group parsing_utils
 *
 * @param [input] - The URL to parse.
 * @param [defaultProto] - The default protocol to use if the input doesn't have one.
 * @returns A parsed URL object.
 */
export function parseURL<const S extends string>(
  input: S,
): Refine<S, ParseURL<S>, ParsedURL>;
export function parseURL(input?: string, defaultProto?: string): ParsedURL;
export function parseURL(input = "", defaultProto?: string): ParsedURL {
  // WHATWG: browsers strip \t \n \r from schemes before matching. Do the same before the
  // dangerous-scheme fast path so `parseURL` and `isScriptProtocol` cannot disagree.
  const _preScheme = input.replace(/[\t\n\r]/g, "");
  const _schemeMatch = _preScheme.match(/^[\s\0]*([\w+.-]{2,}):(.*)/s);
  if (_schemeMatch && isScriptProtocol(_schemeMatch[1] ?? "")) {
    const _proto = `${(_schemeMatch[1] ?? "").toLowerCase()}:`;
    const _pathname = _schemeMatch[2] ?? "";
    // Preserve original-case scheme in href (behaviour-preserving for callers that
    // use href as a raw string) but always return the normalised protocol field.
    const _rawProto = _preScheme.match(/^[\s\0]*([\w+.-]{2,}:)/)?.[1] ?? _proto;
    return {
      protocol: _proto,
      pathname: _pathname,
      href: _rawProto + _pathname,
      auth: "",
      host: "",
      search: "",
      hash: "",
    };
  }

  if (!hasProtocol(input, { acceptRelative: true })) {
    return defaultProto ? parseURL(defaultProto + input) : parsePath(input);
  }

  // CORR-06: opaque-scheme URIs — `scheme:` NOT followed by `//` (RFC 3986 §3).
  // Handles `mailto:a@b.com`, `tel:+1-555-1234`, `urn:isbn:...`, `http:foo`, `sms:...`, etc.
  // Requires plan 004's tightened alpha-leading scheme class (`[A-Za-z][A-Za-z0-9+.\-]*`)
  // to correctly distinguish schemes from path segments containing a colon.
  //
  // Disambiguation: a bare `foo:bar` string IS a valid opaque URI in RFC 3986. The only
  // reason we don't accept `123:bar` is that plan 004's regex rejects digit-leading schemes.
  const _opaqueMatch = input.match(
    /^[\s\0]*([A-Za-z][A-Za-z0-9+.-]*:)(?!\/\/)(.*)/,
  );
  if (_opaqueMatch) {
    const [, _proto = "", _rest = ""] = _opaqueMatch;
    // The opaque part still admits `?query` and `#fragment` per RFC 3986 §3 (`opaque-part`
    // is `uric_no_slash *uric`; ufo treats them the same as the hierarchical case).
    const { pathname, search, hash } = parsePath(_rest);
    return {
      protocol: _proto.toLowerCase(),
      auth: "",
      host: "",
      pathname,
      search,
      hash,
    };
  }

  // Extract scheme first (no backslash normalization yet); WHATWG only normalizes
  // `\` → `/` for "special schemes" (http, https, ws, wss, ftp, file).
  const _schemePrefix = input.match(/^[\s\0]*([A-Za-z][A-Za-z\d+.-]*:)/);
  const _schemeForCheck = (_schemePrefix?.[1] || "").toLowerCase();
  const _isSpecial = isSpecialScheme(_schemeForCheck);
  const _normalized = _isSpecial ? input.replace(/\\/g, "/") : input;

  // Capture EVERYTHING after `//` (authority + path); we'll resolve userinfo below.
  const [, protocol = "", authorityAndPath = ""] =
    _normalized.match(/^[\s\0]*([A-Za-z][\s\w\0+.-]*:)?\/\/(.*)/) || [];

  // Find the userinfo/host boundary: WHATWG uses the LAST `@` that appears BEFORE
  // the first path terminator (`/`, `?`, `#`).
  const _termIdx = authorityAndPath.search(/[/?#]/);
  const _authoritySlice =
    _termIdx === -1 ? authorityAndPath : authorityAndPath.slice(0, _termIdx);
  const _pathSlice = _termIdx === -1 ? "" : authorityAndPath.slice(_termIdx);
  const _lastAtInAuthority = _authoritySlice.lastIndexOf("@");

  let auth = "";
  let hostAndPath = "";
  if (_lastAtInAuthority === -1) {
    hostAndPath = authorityAndPath;
  } else {
    // Percent-encode any `@` that appears INSIDE userinfo (i.e. before the last @).
    const _rawUserinfo = _authoritySlice.slice(0, _lastAtInAuthority);
    auth = _rawUserinfo.replace(/@/g, "%40");
    hostAndPath = _authoritySlice.slice(_lastAtInAuthority + 1) + _pathSlice;
  }

  // eslint-disable-next-line prefer-const
  let [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)?/) || [];

  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Za-z]:)/, "");
  }

  const { pathname, search, hash } = parsePath(path);

  return {
    protocol: protocol.toLowerCase(),
    auth,
    host,
    pathname,
    search,
    hash,
    [protocolRelative]: !protocol,
  };
}

/**
 * Splits the input string into three parts, and returns an object with those three parts.
 *
 * @example
 *
 * ```js
 * parsePath("http://foo.com/foo?test=123#token");
 * // { pathname: 'http://foo.com/foo', search: '?test=123', hash: '#token' }
 * ```
 *
 * @group parsing_utils
 *
 * @param [input] - The URL to parse.
 * @returns An object with three properties: `pathname`, `search`, and `hash`.
 */
export function parsePath<const S extends string>(
  input: S,
): Refine<S, ParsePathType<S>, ParsedPath>;
export function parsePath(input?: string): ParsedPath;
export function parsePath(input = ""): ParsedPath {
  const [pathname = "", search = "", hash = ""] = (
    input.match(/([^#?]*)(\?[^#]*)?(#.*)?/) || []
  ).splice(1);

  return {
    pathname,
    search,
    hash,
  };
}

/**
 * Takes a string of the form `username:password` and returns an object with the username and
 * password decoded.
 *
 * @group parsing_utils
 *
 * @param [input] - The URL to parse.
 * @returns An object with two properties: username and password.
 */
export function parseAuth(input = ""): ParsedAuth {
  // RFC 3986 §3.2.1: userinfo = *( unreserved / pct-encoded / sub-delims / ":" )
  // The FIRST ":" splits username from password; subsequent colons are part of the password.
  // Percent-decoding follows via `decode(...)`.
  // TODO(v2): percent-encode userinfo per RFC 3986 §3.2.1 (mirrored on serialization side).
  const firstColon = input.indexOf(":");
  if (firstColon === -1) {
    return {
      username: decode(input),
      password: "",
    };
  }
  return {
    username: decode(input.slice(0, firstColon)),
    password: decode(input.slice(firstColon + 1)),
  };
}

/**
 * Takes a string, and returns an object with two properties: `hostname` and `port`.
 *
 * IPv6 authorities must be wrapped in `[...]` per WHATWG. The returned `hostname`
 * keeps the surrounding brackets to match `new URL(...).hostname` in Node/browsers,
 * so `stringifyParsedURL` and `$URL.href` re-emit the address unchanged.
 *
 * @example
 *
 * ```js
 * parseHost("foo.com:8080");
 * // { hostname: 'foo.com', port: '8080' }
 *
 * parseHost("[::1]:8080");
 * // { hostname: '[::1]', port: '8080' }
 * ```
 *
 * @group parsing_utils
 *
 * @param [input] - The URL to parse.
 * @returns An object with `hostname` and `port` (the port is undefined when absent).
 */
export function parseHost(input = ""): ParsedHost {
  // TODO(v2): IPv6 zone-id normalization (e.g. "[fe80::1%25eth0]" — the "%25eth0"
  // suffix inside the brackets). Currently returned verbatim inside the hostname;
  // callers do not decode the zone-id.
  if (input.startsWith("[")) {
    const end = input.indexOf("]");
    if (end === -1) {
      // Malformed: unclosed bracket. Return the input verbatim as hostname; no port.
      return { hostname: decode(input), port: undefined as unknown as string };
    }
    const hostname = decode(input.slice(0, end + 1)); // keep brackets — matches WHATWG URL.hostname
    const rest = input.slice(end + 1);
    if (rest.startsWith(":")) {
      const p = rest.slice(1);
      return {
        hostname,
        port: (p.length > 0 ? p : undefined) as unknown as string,
      };
    }
    return { hostname, port: undefined as unknown as string };
  }
  // Non-IPv6 fast path — preserve historical regex-based behavior.
  const [hostname, port] = (input.match(/([^/:]*):?(\d+)?/) || []).splice(1);
  return {
    hostname: decode(hostname ?? ""),
    port,
  };
}

/**
 * Takes a `ParsedURL` object and returns the stringified URL.
 *
 * @group parsing_utils
 *
 * @example
 *
 * ```js
 * const obj = parseURL("http://foo.com/foo?test=123#token");
 * obj.host = "bar.com";
 *
 * stringifyParsedURL(obj); // "http://bar.com/foo?test=123#token"
 * ```
 *
 * @param [parsed] - The parsed URL
 * @returns A stringified URL.
 */
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string {
  const pathname = parsed.pathname || "";
  const search = parsed.search
    ? (parsed.search.startsWith("?") ? "" : "?") + parsed.search
    : "";
  const hash = parsed.hash || "";
  const auth = parsed.auth ? parsed.auth + "@" : "";
  const host = parsed.host || "";
  // Emit the "//" authority separator ONLY when an authority exists (host present, or
  // any userinfo, or protocol-relative). Opaque URIs (mailto:, tel:, urn:, data:, javascript:,
  // http:foo) have `protocol` set but no host and no protocolRelative flag — they must
  // serialize as `scheme:opaque-part`, NOT `scheme://opaque-part`.
  const hasAuthority =
    Boolean(host) || Boolean(auth) || Boolean(parsed[protocolRelative]);
  let proto = "";
  if (parsed.protocol) {
    proto = parsed.protocol + (hasAuthority ? "//" : "");
  } else if (parsed[protocolRelative]) {
    proto = "//";
  }
  return proto + auth + host + pathname + search + hash;
}

const FILENAME_STRICT_REGEX = /\/([^/]+\.[^/]+)$/;
const FILENAME_REGEX = /\/([^/]+)$/;

/**
 * Parses a URL and returns last segment in path as filename.
 *
 * If `{ strict: true }` is passed as the second argument, it will only return the last segment only if ending with an extension.
 *
 * @group parsing_utils
 *
 * @example
 *
 * ```js
 * // Result: filename.ext
 * parseFilename("http://example.com/path/to/filename.ext");
 *
 * // Result: undefined
 * parseFilename("/path/to/.hidden-file", { strict: true });
 * ```
 *
 * @param [input] - The URL to parse.
 * @param [opts]  - Options to use while parsing
 */
export function parseFilename<
  const S extends string,
  const Strict extends boolean = false,
>(
  input: S,
  opts?: { strict?: Strict },
): Refine<S, ParseFilename<S, Strict>, string | undefined>;
export function parseFilename(
  input?: string,
  opts?: { strict?: boolean },
): string | undefined;
export function parseFilename(
  input = "",
  opts?: { strict?: boolean },
): string | undefined {
  const { pathname } = parseURL(input);
  const matches = opts?.strict
    ? pathname.match(FILENAME_STRICT_REGEX)
    : pathname.match(FILENAME_REGEX);
  return matches ? matches[1] : undefined;
}
