import type { JoinURLOptions } from "./protocol";
import { hasProtocol } from "./protocol";
import { normalizeProtocolRelative } from "./_modify";
import { joinURL } from "./join";
import { isEmptyURL } from "./predicates";
import { withoutTrailingSlash } from "./slash";

const URL_BOUNDARY_CHARS = new Set(["/", "?", "#"]);

function isAtBaseBoundary(input: string, baseLen: number): boolean {
  if (input.length === baseLen) {
    return true;
  }
  const char = input[baseLen];
  return char !== undefined && URL_BOUNDARY_CHARS.has(char);
}

/**
 * Ensures the URL or pathname starts with base.
 *
 * If input already starts with base, it will not be added again.
 *
 * @example
 *
 * ```js
 * withBase("/foo/bar", "/foo"); // "/foo/bar"
 *
 * withBase("/foo/bar", "/baz"); // "/baz/foo/bar"
 *
 * // Leading "//" is normalized (SEC-02 open-redirect hardening):
 * withBase("//attacker.com/x", "/"); // "/attacker.com/x"
 * // Opt-out is available for callers who genuinely want a protocol-relative URL:
 * withBase("//host/x", "/", { allowProtocolRelative: true }); // "//host/x"
 * ```
 *
 * @param input - The URL or pathname.
 * @param base - The base path to prepend.
 * @param [opts] - Options controlling open-redirect hardening.
 * @returns The URL with the base prepended (or unchanged if already present).
 * @group utils
 */
export function withBase(input: string, base: string, opts?: JoinURLOptions): string {
  if (isEmptyURL(base) || hasProtocol(input)) {
    return normalizeProtocolRelative(input, base, opts);
  }
  const normalizedInput = normalizeProtocolRelative(input, base, opts);
  const baseNorm = withoutTrailingSlash(base);
  if (normalizedInput.startsWith(baseNorm) && isAtBaseBoundary(normalizedInput, baseNorm.length)) {
    // Boundary chars: "/", "?", "#" — fragment must not defeat the check.
    return normalizedInput;
  }
  return joinURL(baseNorm, normalizedInput);
}

/**
 * Removes the base from the URL or pathname.
 *
 * If input does not start with base, it will not be removed.
 *
 * @example
 *
 * ```js
 * withoutBase("/foo/bar", "/foo"); // "/bar"
 * ```
 *
 * @param input - The URL or pathname.
 * @param base - The base path to remove.
 * @returns The URL with the base removed (or unchanged if not present).
 * @group utils
 */
export function withoutBase(input: string, base: string): string {
  if (isEmptyURL(base)) {
    return input;
  }
  const baseNorm = withoutTrailingSlash(base);
  if (!input.startsWith(baseNorm)) {
    return input;
  }
  // Boundary chars: "/", "?", "#" — fragment must not defeat the check.
  if (!isAtBaseBoundary(input, baseNorm.length)) {
    return input;
  }
  const trimmed = input.slice(baseNorm.length).replace(/^\/+/u, "");
  return `/${trimmed}`;
}
