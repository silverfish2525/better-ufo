import type {
  HasLeadingSlash,
  HasTrailingSlash,
  Refine,
  WithLeadingSlash,
  WithoutLeadingSlash,
  WithoutTrailingSlash,
  WithTrailingSlash,
} from "../_types";

const TRAILING_SLASH_RE = /\/$|\/\?|\/#/;

/**
 * Checks if the URL or pathname ends with a trailing slash.
 *
 * @group utils
 */
export function hasTrailingSlash<const S extends string>(
  input: S,
): HasTrailingSlash<S>;
export function hasTrailingSlash(
  input?: string,
  respectQueryAndFragment?: boolean,
): boolean;
export function hasTrailingSlash(
  input = "",
  respectQueryAndFragment?: boolean,
): boolean {
  if (!respectQueryAndFragment) {
    return input.endsWith("/");
  }
  return TRAILING_SLASH_RE.test(input);
}

/**
 * Removes the trailing slash from the URL or pathname.
 *
 * If second argument is `true`, it will only remove the trailing slash if it's not part of the query or fragment with cost of more expensive operations.
 *
 * @example
 *
 * ```js
 * withoutTrailingSlash("/foo/"); // "/foo"
 *
 * withoutTrailingSlash("/path/?query=true", true); // "/path?query=true"
 * ```
 *
 * @group utils
 */
export function withoutTrailingSlash<const S extends string>(
  input: S,
): Refine<S, WithoutTrailingSlash<S>>;
export function withoutTrailingSlash(
  input?: string,
  respectQueryAndFragment?: boolean,
): string;
export function withoutTrailingSlash(
  input = "",
  respectQueryAndFragment?: boolean,
): string {
  if (!respectQueryAndFragment) {
    return (hasTrailingSlash(input) ? input.slice(0, -1) : input) || "/";
  }
  if (!hasTrailingSlash(input, true)) {
    return input || "/";
  }
  let path = input;
  let fragment = "";
  const fragmentIndex = input.indexOf("#");
  if (fragmentIndex !== -1) {
    path = input.slice(0, fragmentIndex);
    fragment = input.slice(fragmentIndex);
  }
  const [s0 = "", ...s] = path.split("?");
  const cleanPath = s0.endsWith("/") ? s0.slice(0, -1) : s0;
  return (
    (cleanPath || "/") + (s.length > 0 ? `?${s.join("?")}` : "") + fragment
  );
}

/**
 * Ensures the URL ends with a trailing slash.
 *
 * If second argument is `true`, it will only add the trailing slash if it's not part of the query or fragment with cost of more expensive operation.
 *
 * @example
 *
 * ```js
 * withTrailingSlash("/foo"); // "/foo/"
 *
 * withTrailingSlash("/path?query=true", true); // "/path/?query=true"
 * ```
 *
 * @group utils
 */
export function withTrailingSlash<const S extends string>(
  input: S,
): Refine<S, WithTrailingSlash<S>>;
export function withTrailingSlash(
  input?: string,
  respectQueryAndFragment?: boolean,
): string;
export function withTrailingSlash(
  input = "",
  respectQueryAndFragment?: boolean,
): string {
  if (!respectQueryAndFragment) {
    return input.endsWith("/") ? input : `${input}/`;
  }
  if (hasTrailingSlash(input, true)) {
    return input || "/";
  }
  let path = input;
  let fragment = "";
  const fragmentIndex = input.indexOf("#");
  if (fragmentIndex !== -1) {
    path = input.slice(0, fragmentIndex);
    fragment = input.slice(fragmentIndex);
    if (!path) {
      return fragment;
    }
  }
  const [s0 = "", ...s] = path.split("?");
  return `${s0}/${s.length > 0 ? `?${s.join("?")}` : ""}${fragment}`;
}

/**
 * Checks if the input has a leading slash (e.g. `/foo`).
 *
 * @group utils
 */
export function hasLeadingSlash<const S extends string>(
  input: S,
): HasLeadingSlash<S>;
export function hasLeadingSlash(input?: string): boolean;
export function hasLeadingSlash(input = ""): boolean {
  return input.startsWith("/");
}

/**
 * Removes leading slash from the URL or pathname.
 *
 * @example
 *
 * ```js
 * withoutLeadingSlash("/foo"); // "foo"
 * ```
 *
 * @group utils
 */
export function withoutLeadingSlash<const S extends string>(
  input: S,
): Refine<S, WithoutLeadingSlash<S>>;
export function withoutLeadingSlash(input?: string): string;
export function withoutLeadingSlash(input = ""): string {
  return (hasLeadingSlash(input) ? input.slice(1) : input) || "/";
}

/**
 * Ensures the URL or pathname has a leading slash.
 *
 * @example
 *
 * ```js
 * withLeadingSlash("foo"); // "/foo"
 * ```
 *
 * @group utils
 */
export function withLeadingSlash<const S extends string>(
  input: S,
): Refine<S, WithLeadingSlash<S>>;
export function withLeadingSlash(input?: string): string;
export function withLeadingSlash(input = ""): string {
  return hasLeadingSlash(input) ? input : `/${input}`;
}
