import type { IsScriptProtocol, IsSpecialScheme, Refine, WithProtocol } from "../_types";

const PROTOCOL_STRICT_REGEX = /^[\s\0]*[A-Z][A-Z0-9+.-]+:[/\\]{1,2}/iu;
const PROTOCOL_REGEX = /^[\s\0]*[A-Z][\s\w\0+.-]+:(?:[/\\]{2})?/iu;
// Issue unjs/ufo#237: distinguishes bare `hostname:port` from opaque URI schemes.
const HOST_PORT_RE =
  /^(?:localhost|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+):\d+(?:[/?#]|$)/iu;
const PROTOCOL_RELATIVE_REGEX = /^(?:[/\\]\s*){2,}[^/\\]/u;

const SCHEME_STRIP_RE = /[\t\n\r]/gu;

function normalizeSchemeForProtocolChecks(input: string): string {
  return input.replace(SCHEME_STRIP_RE, "");
}

const SCRIPT_SCHEMES: ReadonlySet<string> = new Set(["blob", "data", "javascript", "vbscript"]);

export interface HasProtocolOptions {
  acceptRelative?: boolean;
  strict?: boolean;
}

/**
 * Options accepted by {@link joinURL} and {@link withBase} to control leading
 * `//` handling on the concatenated result.
 *
 * @group utils
 */
export interface JoinURLOptions {
  /**
   * If `true`, a leading `//` in the concatenated result is preserved (produces
   * a protocol-relative URL). Default is `false` — the leading `//` is
   * collapsed to a single `/` to prevent accidental open-redirect payloads
   * when the base is empty or `"/"`.
   *
   * @default false
   */
  allowProtocolRelative?: boolean;
}

export function hasProtocol(inputString: string, opts?: HasProtocolOptions): boolean;

/** @deprecated Boolean shorthand for { acceptRelative: boolean }; prefer the options object overload. */
export function hasProtocol(inputString: string, acceptRelative: boolean): boolean;

/**
 * Checks if the input has a protocol.
 *
 * You can use `{ acceptRelative: true }` to accept relative URLs as valid protocol.
 *
 * @example
 *
 * ```js
 * hasProtocol('https://example.com'); // true
 *
 * hasProtocol("//example.com"); // false
 *
 * hasProtocol('//example.com', { acceptRelative: true });  // true
 *
 * hasProtocol("ftp://example.com"); // true
 *
 * hasProtocol('data:text/plain'); // true
 *
 * hasProtocol('data:text/plain', { strict: true }); // false
 * ```
 *
 * @param inputString - The URL string to check for a protocol.
 * @param [opts] - Options or a boolean shorthand for `acceptRelative`.
 * @returns `true` if the input has a protocol (or protocol-relative URL when `acceptRelative` is set).
 * @group utils
 */
export function hasProtocol(inputString: string, opts: boolean | HasProtocolOptions = {}): boolean {
  const resolvedOpts: HasProtocolOptions =
    typeof opts === "boolean" ? { acceptRelative: opts } : opts;
  const normalized = normalizeSchemeForProtocolChecks(inputString);
  if (resolvedOpts.strict === true) {
    return PROTOCOL_STRICT_REGEX.test(normalized);
  }
  return (
    PROTOCOL_REGEX.test(normalized) ||
    (resolvedOpts.acceptRelative === true ? PROTOCOL_RELATIVE_REGEX.test(normalized) : false)
  );
}

/**
 * Checks if the input protocol is any of the dangerous `blob:`, `data:`, `javascript`: or `vbscript:` protocols.
 *
 * @example
 *
 * ```js
 * isScriptProtocol("javascript:alert(1)"); // true
 *
 * isScriptProtocol("data:text/html,hello"); // true
 *
 * isScriptProtocol("blob:hello"); // true
 *
 * isScriptProtocol("vbscript:alert(1)"); // true
 *
 * isScriptProtocol("https://example.com"); // false
 * ```
 *
 * @group utils
 */
export function isScriptProtocol<const S extends string>(protocol: S): IsScriptProtocol<S>;
export function isScriptProtocol(protocol?: string): boolean;
export function isScriptProtocol(protocol?: string): boolean {
  if (protocol === undefined || protocol === "") {
    return false;
  }
  const normalized = normalizeSchemeForProtocolChecks(protocol)
    .replace(/^[\s\0]+/u, "")
    .replace(/:$/u, "")
    .toLowerCase();
  return SCRIPT_SCHEMES.has(normalized);
}

/**
 * Adds or replaces protocol of the input URL.
 *
 * @example
 * ```js
 * withProtocol("http://example.com", "ftp://"); // "ftp://example.com"
 * ```
 *
 * @group utils
 */
export function withProtocol<const S extends string, const P extends string>(
  input: S,
  protocol: P,
): Refine<S, WithProtocol<S, P>>;
export function withProtocol(input: string, protocol: string): string;
export function withProtocol(input: string, protocol: string): string {
  // Unjs/ufo#237: `localhost:9000` has no scheme; strip only real scheme prefixes.
  if (HOST_PORT_RE.test(input)) {
    return protocol + input;
  }
  let match = PROTOCOL_REGEX.exec(input);
  match ??= /^\/{2,}/u.exec(input);
  if (!match) {
    return protocol + input;
  }
  return protocol + input.slice(match[0].length);
}

/**
 * Adds or replaces the URL protocol to `http://`.
 *
 * @example
 *
 * ```js
 * withHttp("https://example.com"); // http://example.com
 * ```
 *
 * @group utils
 */
export function withHttp<const S extends string>(input: S): Refine<S, WithProtocol<S, "http://">>;
export function withHttp(input: string): string;
export function withHttp(input: string): string {
  return withProtocol(input, "http://");
}

/**
 * Adds or replaces the URL protocol to `https://`.
 *
 * @example
 *
 * ```js
 * withHttps("http://example.com"); // https://example.com
 * ```
 *
 * @group utils
 */
export function withHttps<const S extends string>(input: S): Refine<S, WithProtocol<S, "https://">>;
export function withHttps(input: string): string;
export function withHttps(input: string): string {
  return withProtocol(input, "https://");
}

/**
 * Removes the protocol from the input.
 *
 * @example
 * ```js
 * withoutProtocol("http://example.com"); // "example.com"
 * ```
 */
export function withoutProtocol<const S extends string>(input: S): Refine<S, WithProtocol<S, "">>;
export function withoutProtocol(input: string): string;
export function withoutProtocol(input: string): string {
  return withProtocol(input, "");
}

/**
 * WHATWG "special schemes" — the only schemes for which browsers normalize `\` → `/`
 * and apply host-based-URL treatment. Source of truth: WHATWG URL Living Standard §4.1.
 *
 * @group utils
 */
export const SPECIAL_SCHEMES: ReadonlySet<string> = new Set([
  "http",
  "https",
  "ws",
  "wss",
  "ftp",
  "file",
]);

/**
 * Returns true if the given protocol/scheme is a WHATWG "special scheme".
 *
 * @group utils
 */
export function isSpecialScheme<const S extends string>(scheme: S): IsSpecialScheme<S>;
export function isSpecialScheme(scheme?: string): boolean;
export function isSpecialScheme(scheme?: string): boolean {
  if (scheme === undefined || scheme === "") {
    return false;
  }
  return SPECIAL_SCHEMES.has(scheme.toLowerCase().replace(/:$/u, ""));
}
