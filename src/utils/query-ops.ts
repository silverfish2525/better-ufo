import type { Refine, WithoutQuery, WithQueryResult } from "../_types";
import type { ParsedQuery, QueryObject } from "../query";
import { parseURL } from "../parse";
import { parseQuery, stringifyQuery } from "../query";
import { modifyParsedURL } from "./_modify";

/**
 * Add/Replace the query section of the URL.
 *
 * @example
 *
 * ```js
 * withQuery("/foo?page=a", { token: "secret" }); // "/foo?page=a&token=secret"
 * ```
 *
 * @group utils
 */
export function withQuery<
  const Input extends string,
  const Q extends QueryObject,
>(input: Input, query: Q): WithQueryResult<Input, Q>;
export function withQuery(input: string, query: QueryObject): string;
export function withQuery(input: string, query: QueryObject): string {
  return modifyParsedURL(input, (parsed) => {
    parsed.search = stringifyQuery({
      ...parseQuery(parsed.search),
      ...query,
    });
  });
}

/**
 * Filters the query section of the URL, keeping only entries for which `predicate` returns `true`.
 *
 * @example
 *
 * ```js
 * filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar"); // "/foo?baz=2"
 * ```
 *
 * @group utils
 */
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string {
  if (!input.includes("?")) {
    return input;
  }
  return modifyParsedURL(input, (parsed) => {
    const query = parseQuery(parsed.search);
    const filteredQuery: ParsedQuery = Object.create(
      Object.getPrototypeOf(query) as object | null,
    ) as ParsedQuery;
    for (const key of Object.keys(query)) {
      const value = query[key];
      if (value !== undefined && predicate(key, value)) {
        filteredQuery[key] = value;
      }
    }
    parsed.search = stringifyQuery(filteredQuery);
  });
}

/**
 * Parses and decodes the query object of an input URL into an object.
 *
 * @example
 *
 * ```js
 * getQuery("http://foo.com/foo?test=123&unicode=%E5%A5%BD");
 * // { test: "123", unicode: "好" }
 * ```
 * @group utils
 */
export function getQuery<T extends ParsedQuery = ParsedQuery>(
  input: string,
): T {
  return parseQuery<T>(parseURL(input).search);
}

export function withoutQuery<const S extends string>(
  input: S,
): Refine<S, WithoutQuery<S>>;
export function withoutQuery(input: string): string;
/**
 * Removes the query string from a URL, preserving path and fragment.
 *
 * @example
 *
 * ```js
 * withoutQuery("https://a.com/b?x=1#h")
 * // Returns "https://a.com/b#h"
 * ```
 *
 * @group utils
 */
export function withoutQuery(input: string): string {
  const qIdx = input.indexOf("?");
  if (qIdx === -1)
    return input;
  const hIdx = input.indexOf("#", qIdx);
  if (hIdx === -1)
    return input.slice(0, qIdx);
  return input.slice(0, qIdx) + input.slice(hIdx);
}
