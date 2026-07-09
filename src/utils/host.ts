import type { Refine, WithoutHost } from "../_types";
import { parseURL, stringifyParsedURL } from "../parse";
import { hasProtocol } from "./protocol";

/**
 * Removes the host from the URL while preserving everything else.
 *
 * @example
 * ```js
 * withoutHost("http://example.com/foo?q=123#bar")
 * // Returns "/foo?q=123#bar"
 * ```
 *
 * @group utils
 */
export function withoutHost<const S extends string>(input: S): Refine<S, WithoutHost<S>>;
export function withoutHost(input: string): string;
export function withoutHost(input: string): string {
  if (
    !hasProtocol(input, { acceptRelative: true }) &&
    input.length > 0 &&
    (input.startsWith("/") || input.startsWith("?") || input.startsWith("#"))
  ) {
    return input.startsWith("/") ? input : `/${input}`;
  }
  const parsed = parseURL(input);
  return (parsed.pathname || "/") + parsed.search + parsed.hash;
}

function hasNoAuthoritySlot(input: string): boolean {
  return (
    !hasProtocol(input, { acceptRelative: true }) &&
    input.length > 0 &&
    (input.startsWith("/") || input.startsWith("?") || input.startsWith("#"))
  );
}

function validatePort(port: string | number): string {
  const n = typeof port === "number" ? port : Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65_535) {
    throw new TypeError(
      `withPort: expected integer in [1, 65535], got ${JSON.stringify(port)}. ` +
        `Use withoutPort() to strip the port.`,
    );
  }
  return String(n);
}

/**
 * Sets or replaces the host authority slot, preserving `auth`, port, path,
 * search, and hash. Relative inputs (no scheme, no leading `//`) are
 * returned unchanged — `withHost` is a *replace* operator, not a
 * promote-to-absolute* operator.
 *
 * @example
 * ```js
 * withHost("http://example.com/foo?x=1#h", "other.com")
 * // Returns "http://other.com/foo?x=1#h"
 *
 * withHost("http://user:pw@example.com:8080/x", "new.com")
 * // Returns "http://user:pw@new.com:8080/x"    (auth + port preserved)
 *
 * withHost("/only/path", "example.com")
 * // Returns "/only/path"                       (no-op on relative input)
 * ```
 *
 * @param input - The URL string.
 * @param host - The new host value to set.
 * @returns The URL string with the host replaced.
 * @group utils
 */
export function withHost(input: string, host: string): string {
  if (hasNoAuthoritySlot(input)) {
    return input;
  }
  const parsed = parseURL(input);
  parsed.host = host;
  return stringifyParsedURL(parsed);
}

/**
 * Sets or replaces the port slot. Accepts `string | number` for ergonomics.
 * Passing `0`, an empty string, or a value outside the 1..65535 range throws
 * `TypeError` — use `withoutPort` to strip.
 *
 * @example
 * ```js
 * withPort("http://example.com/x", 8080)   // "http://example.com:8080/x"
 * withPort("http://example.com:80/x", 443) // "http://example.com:443/x"
 * withPort("/only/path", 8080)             // "/only/path"  (no-op)
 * ```
 *
 * @param input - The URL string.
 * @param port - The port number or string (1–65535).
 * @returns The URL string with the port set.
 * @group utils
 */
export function withPort(input: string, port: string | number): string {
  const portString = validatePort(port);
  if (hasNoAuthoritySlot(input)) {
    return input;
  }
  const parsed = parseURL(input);
  const host = parsed.host ?? "";
  if (host === "") {
    return input;
  }
  const hostname = host.replace(/:\d+$/u, "").replace(/^(?<bracket>\[[^\]]*\]).*$/u, "$<bracket>");
  parsed.host = `${hostname}:${portString}`;
  return stringifyParsedURL(parsed);
}

/**
 * Strips the port from an absolute URL's authority, leaving everything else
 * untouched. No-op on relative inputs or URLs without a port.
 *
 * @example
 * ```js
 * withoutPort("http://example.com:8080/x") // "http://example.com/x"
 * withoutPort("http://example.com/x")      // "http://example.com/x"
 * withoutPort("/relative/path")            // "/relative/path"
 * ```
 *
 * @param input - The URL string.
 * @returns The URL string with the port removed.
 * @group utils
 */
export function withoutPort(input: string): string {
  if (hasNoAuthoritySlot(input)) {
    return input;
  }
  const parsed = parseURL(input);
  const { host } = parsed;
  if (host === undefined || host === "") {
    return input;
  }
  parsed.host = host.replace(/(?<keep>\]|[^:](?::\d+)?):\d+$/u, (_m, p1: string) => p1);
  return stringifyParsedURL(parsed);
}

/**
 * Strips the userinfo (`user:pass@`) prefix from an absolute URL's
 * authority. No-op on relative inputs or URLs without userinfo.
 *
 * @example
 * ```js
 * withoutAuth("http://user:pw@example.com/x") // "http://example.com/x"
 * withoutAuth("http://user@example.com/x")    // "http://example.com/x"
 * withoutAuth("http://example.com/x")         // "http://example.com/x"
 * withoutAuth("/relative/path")               // "/relative/path"
 * ```
 *
 * @param input - The URL string.
 * @returns The URL string with userinfo stripped.
 * @group utils
 */
export function withoutAuth(input: string): string {
  if (hasNoAuthoritySlot(input)) {
    return input;
  }
  const parsed = parseURL(input);
  parsed.auth = "";
  return stringifyParsedURL(parsed);
}
