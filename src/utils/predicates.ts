import { withLeadingSlash, withTrailingSlash, withoutTrailingSlash } from "./slash";
import type { IsRelative } from "../_types";
import { decode } from "../encoding";

/**
 * Check if a path starts with `./` or `../`.
 *
 * @example
 * ```js
 * isRelative("./foo"); // true
 * ```
 *
 * @param inputString - The URL string to test.
 * @returns `true` if the string starts with `"./"` or `"../"`.
 * @group utils
 */
export function isRelative<const S extends string>(inputString: S): IsRelative<S>;
export function isRelative(inputString: string): boolean;
export function isRelative(inputString: string): boolean {
  return ["./", "../"].some((string_) => inputString.startsWith(string_));
}

/**
 * Checks if the input URL is empty or `/`.
 *
 * @param url - The URL string to test.
 * @returns `true` if the URL is empty or equals `"/"`.
 * @group utils
 */
export function isEmptyURL(url: string): boolean {
  return !url || url === "/";
}

/**
 * Checks if the input URL is neither empty nor `/`.
 *
 * @param url - The URL string to test.
 * @returns `true` if the URL is non-empty and not equals `"/"`.
 * @group utils
 */
export function isNonEmptyURL(url: string): boolean {
  return Boolean(url) && url !== "/";
}

/**
 * Checks if two paths are the same regardless of trailing slash.
 *
 * @example
 *
 * ```js
 * isSamePath("/foo", "/foo/"); // true
 * ```
 *
 * @param p1 - First path string.
 * @param p2 - Second path string.
 * @returns `true` if both paths are the same ignoring trailing slash.
 * @group utils
 */
export function isSamePath(p1: string, p2: string): boolean {
  return decode(withoutTrailingSlash(p1)) === decode(withoutTrailingSlash(p2));
}

interface CompareURLOptions {
  trailingSlash?: boolean;
  leadingSlash?: boolean;
  encoding?: boolean;
}

/**
 *  Checks if two paths are equal regardless of encoding, trailing slash, and leading slash differences.
 *
 * You can make slash check strict by setting `{ trailingSlash: true, leadingSlash: true }` as options.
 *
 * You can make encoding check strict by setting `{ encoding: true }` as options.
 *
 * @example
 *
 * ```js
 * isEqual("/foo", "foo"); // true
 * isEqual("foo/", "foo"); // true
 * isEqual("/foo bar", "/foo%20bar"); // true
 *
 * // Strict compare
 * isEqual("/foo", "foo", { leadingSlash: true }); // false
 * isEqual("foo/", "foo", { trailingSlash: true }); // false
 * isEqual("/foo bar", "/foo%20bar", { encoding: true }); // false
 * ```
 *
 * @param a - First URL string.
 * @param b - Second URL string.
 * @param [options] - Comparison options.
 * @returns `true` if both URLs are considered equal under the given options.
 * @group utils
 */
export function isEqual(a: string, b: string, options: CompareURLOptions = {}): boolean {
  let lhs = a;
  let rhs = b;
  if (options.trailingSlash !== true) {
    lhs = withTrailingSlash(lhs);
    rhs = withTrailingSlash(rhs);
  }
  if (options.leadingSlash !== true) {
    lhs = withLeadingSlash(lhs);
    rhs = withLeadingSlash(rhs);
  }
  if (options.encoding !== true) {
    lhs = decode(lhs);
    rhs = decode(rhs);
  }
  return lhs === rhs;
}
