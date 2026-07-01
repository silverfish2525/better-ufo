import { decode } from "./encoding";
import { hasProtocol, isScriptProtocol } from "./utils";
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
  port: string;
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
  if (_schemeMatch && isScriptProtocol(_schemeMatch[1])) {
    const _proto = `${_schemeMatch[1].toLowerCase()}:`;
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

  const [, protocol = "", auth, hostAndPath = ""] =
    input
      .replace(/\\/g, "/")
      .match(/^[\s\0]*([\w+.-]{2,}:)?\/\/([^/@]+@)?(.*)/) || [];

  // eslint-disable-next-line prefer-const
  let [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)?/) || [];

  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Za-z]:)/, "");
  }

  const { pathname, search, hash } = parsePath(path);

  return {
    protocol: protocol.toLowerCase(),
    auth: auth ? auth.slice(0, Math.max(0, auth.length - 1)) : "",
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
  const [username, password] = input.split(":");
  return {
    username: decode(username),
    password: decode(password),
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
    hostname: decode(hostname),
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
  const proto =
    parsed.protocol || parsed[protocolRelative]
      ? (parsed.protocol || "") + "//"
      : "";
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
