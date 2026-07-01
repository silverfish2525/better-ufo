import type { JoinURLOptions } from "./protocol";
import { normalizeProtocolRelative } from "./_modify";
import { joinURL } from "./join";
import { isEmptyURL } from "./predicates";
import { hasProtocol } from "./protocol";
import { withoutTrailingSlash } from "./slash";

const URL_BOUNDARY_CHARS = new Set(["/", "?", "#"]);

function isAtBaseBoundary(input: string, baseLen: number): boolean {
  if (input.length === baseLen)
    return true;
  return URL_BOUNDARY_CHARS.has(input[baseLen]!);
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
 * @group utils
 */
export function withBase(input: string, base: string, opts?: JoinURLOptions): string {
  if (isEmptyURL(base) || hasProtocol(input)) {
    return normalizeProtocolRelative(input, base, opts);
  }
  const _input = normalizeProtocolRelative(input, base, opts);
  const _base = withoutTrailingSlash(base);
  if (_input.startsWith(_base) && isAtBaseBoundary(_input, _base.length)) {
    // Boundary chars: "/", "?", "#" — fragment must not defeat the check.
    return _input;
  }
  return joinURL(_base, _input);
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
 * @group utils
 */
export function withoutBase(input: string, base: string): string {
  if (isEmptyURL(base)) {
    return input;
  }
  const _base = withoutTrailingSlash(base);
  if (!input.startsWith(_base)) {
    return input;
  }
  // Boundary chars: "/", "?", "#" — fragment must not defeat the check.
  if (!isAtBaseBoundary(input, _base.length)) {
    return input;
  }
  const trimmed = input.slice(_base.length).replace(/^\/+/, "");
  return `/${trimmed}`;
}
