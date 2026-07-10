import type {
  ParseAuthResult,
  ParseFilename,
  ParseHostResult,
  ParsePath as ParsePathType,
  ParseURL,
  Refine,
  StringifyParsedURLResult,
} from "./_types";
import { hasProtocol, isScriptProtocol, isSpecialScheme } from "./utils/protocol";
import { decode } from "./encoding";

const protocolRelative = Symbol.for("ufo:protocolRelative");

/**
 * Safely extracts a named capture group from a regex match, returning `""` when absent.
 *
 * @param groups - The `groups` object from a regex match result (may be `undefined`).
 * @param key - The name of the capture group to extract.
 * @returns The captured string, or `""` if the group is absent.
 */
function grp(groups: Record<string, string> | undefined, key: string): string {
  return groups?.[key] ?? "";
}

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
  const pathMatch = /(?<pathname>[^#?]*)(?<search>\?[^#]*)?(?<hash>#.*)?/u.exec(input);
  const pathname = pathMatch?.groups?.["pathname"] ?? "";
  const search = pathMatch?.groups?.["search"] ?? "";
  const hash = pathMatch?.groups?.["hash"] ?? "";

  return {
    hash,
    pathname,
    search,
  };
}

function splitAuthorityAndPath(authorityAndPath: string): { auth: string; hostAndPath: string } {
  const termIdx = authorityAndPath.search(/[/?#]/u);
  const authoritySlice = termIdx === -1 ? authorityAndPath : authorityAndPath.slice(0, termIdx);
  const pathSlice = termIdx === -1 ? "" : authorityAndPath.slice(termIdx);
  const lastAtInAuthority = authoritySlice.lastIndexOf("@");

  if (lastAtInAuthority === -1) {
    return {
      auth: "",
      hostAndPath: authorityAndPath,
    };
  }

  return {
    auth: authoritySlice.slice(0, lastAtInAuthority).replaceAll("@", "%40"),
    hostAndPath: authoritySlice.slice(lastAtInAuthority + 1) + pathSlice,
  };
}

export function parseURL<const S extends string>(input: S): Refine<S, ParseURL<S>, ParsedURL>;
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
  const normalizedInput = input.replaceAll(/[\t\n\r]/gu, "");
  const schemeMatch = /^[\s\0]*(?<scheme>[\w+.-]{2,}):(?<rest>.*)/su.exec(normalizedInput);
  if (schemeMatch && isScriptProtocol(grp(schemeMatch.groups, "scheme"))) {
    const proto = `${grp(schemeMatch.groups, "scheme").toLowerCase()}:`;
    const pathname = grp(schemeMatch.groups, "rest");
    const rawProtoMatch = /^[\s\0]*(?<rawScheme>[\w+.-]{2,}:)/u.exec(normalizedInput);
    const rawProto = grp(rawProtoMatch?.groups, "rawScheme") || proto;
    return {
      auth: "",
      hash: "",
      host: "",
      href: rawProto + pathname,
      pathname,
      protocol: proto,
      search: "",
    };
  }

  if (!hasProtocol(normalizedInput, { acceptRelative: true })) {
    return defaultProto !== undefined && defaultProto !== ""
      ? parseURL(defaultProto + normalizedInput)
      : parsePath(normalizedInput);
  }

  // Opaque-scheme URIs: `scheme:` NOT followed by `//` (RFC 3986 §3).
  // Handles mailto:, tel:, urn:, data:, blob:, etc.
  const opaqueMatch = /^[\s\0]*(?<opaqueScheme>[A-Z][A-Z0-9+.-]*:)(?!\/\/)(?<opaqueRest>.*)/iu.exec(
    normalizedInput,
  );
  if (opaqueMatch) {
    const proto = grp(opaqueMatch.groups, "opaqueScheme");
    const rest = grp(opaqueMatch.groups, "opaqueRest");
    const { pathname, search, hash } = parsePath(rest);
    return {
      auth: "",
      hash,
      host: "",
      pathname,
      protocol: proto.toLowerCase(),
      search,
    };
  }

  const schemePrefix = /^[\s\0]*(?<schemePrefix>[A-Z][A-Z\d+.-]*:)/iu.exec(normalizedInput);
  const schemeForCheck = grp(schemePrefix?.groups, "schemePrefix").toLowerCase();
  const isSpecial = isSpecialScheme(schemeForCheck);
  const normalized = isSpecial ? normalizedInput.replaceAll("\\", "/") : normalizedInput;

  const authorityMatch = /^[\s\0]*(?<proto>[A-Z][\s\w\0+.-]*:)?\/\/(?<afterAuthority>.*)/iu.exec(
    normalized,
  );
  const protocol = grp(authorityMatch?.groups, "proto");
  const authorityAndPath = grp(authorityMatch?.groups, "afterAuthority");

  const { auth, hostAndPath } = splitAuthorityAndPath(authorityAndPath);
  const hostPathMatch = /(?<hostPart>[^#/?]*)(?<pathPart>.*)/su.exec(hostAndPath);
  const host = grp(hostPathMatch?.groups, "hostPart");
  let path = grp(hostPathMatch?.groups, "pathPart");

  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Z]:)/iu, "");
  }

  const { pathname, search, hash } = parsePath(path);

  return {
    auth,
    hash,
    host,
    pathname,
    protocol: protocol.toLowerCase(),
    search,
    [protocolRelative]: !protocol,
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
export function parseAuth(): { password: ""; username: "" };
export function parseAuth<const S extends string>(input: S): ParseAuthResult<S>;
export function parseAuth(input?: string): ParsedAuth;
export function parseAuth(input = ""): ParsedAuth {
  const firstColon = input.indexOf(":");
  if (firstColon === -1) {
    return {
      password: "",
      username: decode(input),
    };
  }
  return {
    password: decode(input.slice(firstColon + 1)),
    username: decode(input.slice(0, firstColon)),
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
export function parseHost(): { hostname: ""; port: undefined };
export function parseHost<const S extends string>(input: S): ParseHostResult<S>;
export function parseHost(input?: string): ParsedHost;
export function parseHost(input = ""): ParsedHost {
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
  const hostPortMatch = /^(?<hostname>[^/:]*)(?::(?<port>\d+))?$/u.exec(input);
  if (hostPortMatch) {
    return {
      hostname: decode(grp(hostPortMatch.groups, "hostname")),
      port: hostPortMatch.groups?.["port"],
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
export function stringifyParsedURL<const P extends Partial<ParsedURL>>(
  parsed: P,
): StringifyParsedURLResult<P>;
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string;
export function stringifyParsedURL(parsed: Partial<ParsedURL>): string {
  const pathname = parsed.pathname ?? "";
  const rawSearch = parsed.search ?? "";
  const search = rawSearch === "" ? "" : (rawSearch.startsWith("?") ? "" : "?") + rawSearch;
  const hash = parsed.hash ?? "";
  const rawAuth = parsed.auth ?? "";
  const auth = rawAuth === "" ? "" : `${rawAuth}@`;
  const host = parsed.host ?? "";
  const hasAuthority = host !== "" || auth !== "" || Boolean(parsed[protocolRelative]);
  let proto = "";
  if (parsed.protocol !== undefined && parsed.protocol !== "") {
    proto = parsed.protocol + (hasAuthority ? "//" : "");
  } else if (parsed[protocolRelative] === true) {
    proto = "//";
  }
  return proto + auth + host + pathname + search + hash;
}

const FILENAME_STRICT_REGEX = /(?:^|\/)(?<filename>[^/][^./]*\.[^/]+)$/u;
const FILENAME_REGEX = /(?:^|\/)(?<filename>[^/]+)$/u;

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
export function parseFilename<const S extends string, const Strict extends boolean = false>(
  input: S,
  opts?: { strict?: Strict },
): Refine<S, ParseFilename<S, Strict>, string | undefined>;
export function parseFilename(input?: string, opts?: { strict?: boolean }): string | undefined;
export function parseFilename(input = "", opts?: { strict?: boolean }): string | undefined {
  const { pathname } = parseURL(input);
  const matches =
    opts?.strict === true ? FILENAME_STRICT_REGEX.exec(pathname) : FILENAME_REGEX.exec(pathname);
  return matches ? grp(matches.groups, "filename") : undefined;
}
