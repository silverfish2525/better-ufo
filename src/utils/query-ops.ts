import type { Refine, WithQueryResult, WithoutQuery } from "../_types";
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
 * @param input - The URL string.
 * @param query - Query parameters to merge into the URL.
 * @returns The URL with the query parameters applied.
 * @group utils
 */
export function withQuery<const Input extends string, const Q extends QueryObject>(
  input: Input,
  query: Q,
): WithQueryResult<Input, Q>;
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
 * @param input - The URL string to filter.
 * @param predicate - A function that returns `true` for entries to keep.
 * @returns The URL with only the query entries passing the predicate.
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.create returns any
    const filteredQuery: ParsedQuery = Object.create(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- getPrototypeOf return is any
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
 * @param input - The URL string to parse.
 * @returns The parsed query object.
 * @group utils
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public API: callers can specify return type
export function getQuery<T extends ParsedQuery = ParsedQuery>(input: string): T {
  return parseQuery<T>(parseURL(input).search);
}

export function withoutQuery<const S extends string>(input: S): Refine<S, WithoutQuery<S>>;
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
 * @param input - The URL string.
 * @returns The URL with the query string removed.
 * @group utils
 */
export function withoutQuery(input: string): string {
  const qIdx = input.indexOf("?");
  if (qIdx === -1) {
    return input;
  }
  const hIdx = input.indexOf("#", qIdx);
  if (hIdx === -1) {
    return input.slice(0, qIdx);
  }
  return input.slice(0, qIdx) + input.slice(hIdx);
}
