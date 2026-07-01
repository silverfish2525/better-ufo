import type { IsRelative } from "../_types";
import { decode } from "../encoding";
import {
  withLeadingSlash,
  withoutTrailingSlash,
  withTrailingSlash,
} from "./slash";

/**
 * Check if a path starts with `./` or `../`.
 *
 * @example
 * ```js
 * isRelative("./foo"); // true
 * ```
 *
 * @group utils
 */
export function isRelative<const S extends string>(
  inputString: S,
): IsRelative<S>;
export function isRelative(inputString: string): boolean;
export function isRelative(inputString: string): boolean {
  return ["./", "../"].some(string_ => inputString.startsWith(string_));
}

/**
 * Checks if the input URL is empty or `/`.
 *
 * @group utils
 */
export function isEmptyURL(url: string): boolean {
  return !url || url === "/";
}

/**
 * Checks if the input URL is neither empty nor `/`.
 *
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
 * @group utils
 */
export function isEqual(a: string, b: string, options: CompareURLOptions = {}): boolean {
  if (!options.trailingSlash) {
    a = withTrailingSlash(a);
    b = withTrailingSlash(b);
  }
  if (!options.leadingSlash) {
    a = withLeadingSlash(a);
    b = withLeadingSlash(b);
  }
  if (!options.encoding) {
    a = decode(a);
    b = decode(b);
  }
  return a === b;
}
