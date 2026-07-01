import type {
  ParseFilename,
  ParsePath as ParsePathType,
  ParseURL,
  Refine,
} from "./_types";
import { decode } from "./encoding";
import { hasProtocol, isScriptProtocol, isSpecialScheme } from "./utils";

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

export function parseURL<const S extends string>(
  input: S,
): Refine<S, ParseURL<S>, ParsedURL>;
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
 * @param input - The URL to parse.
 * @param defaultProto - The default protocol to use if the input has none.
 * @returns A parsed URL object.
 */
export function parseURL(input?: string, defaultProto?: string): ParsedURL;
export function parseURL(input = "", defaultProto?: string): ParsedURL {
  input = input.replace(/[\t\n\r]/g, "");
  const _schemeMatch = input.match(/^[\s\0]*([\w+.-]{2,}):(.*)/s);
  if (_schemeMatch && isScriptProtocol(_schemeMatch[1] ?? "")) {
    const _proto = `${(_schemeMatch[1] ?? "").toLowerCase()}:`;
    const _pathname = _schemeMatch[2] ?? "";
    const _rawProto = input.match(/^[\s\0]*([\w+.-]{2,}:)/)?.[1] ?? _proto;
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
    return (defaultProto !== undefined && defaultProto !== "") ? parseURL(defaultProto + input) : parsePath(input);
  }

  // Opaque-scheme URIs: `scheme:` NOT followed by `//` (RFC 3986 §3).
  // Handles mailto:, tel:, urn:, data:, blob:, etc.
  const _opaqueMatch = input.match(
    /^[\s\0]*([A-Z][A-Z0-9+.-]*:)(?!\/\/)(.*)/i,
  );
  if (_opaqueMatch) {
    const [, _proto = "", _rest = ""] = _opaqueMatch;
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

  const _schemePrefix = input.match(/^[\s\0]*([A-Z][A-Z\d+.-]*:)/i);
  const _schemeForCheck = (_schemePrefix?.[1] ?? "").toLowerCase();
  const _isSpecial = isSpecialScheme(_schemeForCheck);
  const _normalized = _isSpecial ? input.replace(/\\/g, "/") : input;

  const [, protocol = "", authorityAndPath = ""]
    = _normalized.match(/^[\s\0]*([A-Z][\s\w\0+.-]*:)?\/\/(.*)/i) || [];

  const _termIdx = authorityAndPath.search(/[/?#]/);
  const _authoritySlice
    = _termIdx === -1 ? authorityAndPath : authorityAndPath.slice(0, _termIdx);
  const _pathSlice = _termIdx === -1 ? "" : authorityAndPath.slice(_termIdx);
  const _lastAtInAuthority = _authoritySlice.lastIndexOf("@");

  let auth = "";
  let hostAndPath = "";
  if (_lastAtInAuthority === -1) {
    hostAndPath = authorityAndPath;
  }
  else {
    const _rawUserinfo = _authoritySlice.slice(0, _lastAtInAuthority);
    auth = _rawUserinfo.replace(/@/g, "%40");
    hostAndPath = _authoritySlice.slice(_lastAtInAuthority + 1) + _pathSlice;
  }

  let [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)/s) ?? [];

  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Z]:)/i, "");
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
  // TODO(v2): IPv6 zone-id normalization (e.g. "[fe80::1%25eth0]").
  if (input.startsWith("[")) {
    const end = input.indexOf("]");
    if (end === -1) {
      return { hostname: decode(input), port: undefined };
    }
    const hostname = decode(input.slice(0, end + 1));
    const rest = input.slice(end + 1);
    if (rest.startsWith(":")) {
      const p = rest.slice(1);
      return {
        hostname,
        port: p.length > 0 ? p : undefined,
      };
    }
    return { hostname, port: undefined };
  }
  const m = input.match(/^([^/:]*)(?::(\d+))?$/);
  if (m) {
    return {
      hostname: decode(m[1] ?? ""),
      port: m[2],
    };
  }
  return {
    hostname: decode(input),
    port: undefined,
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
  const pathname = parsed.pathname ?? "";
  const rawSearch = parsed.search ?? "";
  const search = rawSearch !== ""
    ? (rawSearch.startsWith("?") ? "" : "?") + rawSearch
    : "";
  const hash = parsed.hash ?? "";
  const rawAuth = parsed.auth ?? "";
  const auth = rawAuth !== "" ? `${rawAuth}@` : "";
  const host = parsed.host ?? "";
  const hasAuthority = host !== "" || auth !== "" || Boolean(parsed[protocolRelative]);
  let proto = "";
  if (parsed.protocol !== undefined && parsed.protocol !== "") {
    proto = parsed.protocol + (hasAuthority ? "//" : "");
  }
  else if (parsed[protocolRelative] === true) {
    proto = "//";
  }
  return proto + auth + host + pathname + search + hash;
}

const FILENAME_STRICT_REGEX = /(?:^|\/)([^/][^./]*\.[^/]+)$/;
const FILENAME_REGEX = /(?:^|\/)([^/]+)$/;

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
 * @param [opts] - Options.
 * @param [opts.strict] - Only return filename if it has an extension.
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
