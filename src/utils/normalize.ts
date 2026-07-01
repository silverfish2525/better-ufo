import type {
  CleanDoubleSlashes,
  NormalizeURL,
  Refine,
  ResolveURL,
} from "../_types";
import {
  decode,
  decodePath,
  encodeHash,
  encodeHost,
  encodePath,
} from "../encoding";
import { parseURL, stringifyParsedURL } from "../parse";
import { parseQuery, stringifyQuery } from "../query";
import { modifyParsedURL } from "./_modify";
import { isNonEmptyURL } from "./predicates";
import { withoutLeadingSlash, withTrailingSlash } from "./slash";

/**
 * Removes double slashes from the URL.
 *
 * @example
 *
 * ```js
 * cleanDoubleSlashes("//foo//bar//"); // "/foo/bar/"
 *
 * cleanDoubleSlashes("http://example.com/analyze//http://localhost:3000//");
 * // Returns "http://example.com/analyze/http://localhost:3000/"
 * ```
 *
 * @group utils
 */
export function cleanDoubleSlashes<const S extends string>(
  input: S,
): CleanDoubleSlashes<S>;
export function cleanDoubleSlashes(input?: string): string;
export function cleanDoubleSlashes(input = ""): string {
  const qIdx = input.search(/[?#]/);
  const path = qIdx === -1 ? input : input.slice(0, qIdx);
  const rest = qIdx === -1 ? "" : input.slice(qIdx);
  const cleaned = path
    .split("://")
    .map(string_ => string_.replace(/\/{2,}/g, "/"))
    .join("://");
  return cleaned + rest;
}

/**
 * Normalizes the input URL:
 *
 * - Ensures the URL is properly encoded
 * - Ensures pathname starts with a slash
 * - Preserves protocol/host if provided
 *
 * @example
 *
 * ```js
 * normalizeURL("test?query=123 123#hash, test");
 * // Returns "test?query=123%20123#hash,%20test"
 *
 * normalizeURL("http://localhost:3000");
 * // Returns "http://localhost:3000"
 * ```
 *
 * @group utils
 */
export function normalizeURL<const S extends string>(
  input: S,
): Refine<S, NormalizeURL<S>>;
export function normalizeURL(input: string): string;
export function normalizeURL(input: string): string {
  return modifyParsedURL(input, (parsed) => {
    parsed.pathname = encodePath(decodePath(parsed.pathname));
    parsed.hash = encodeHash(decode(parsed.hash));
    parsed.host = encodeHost(decode(parsed.host));
    parsed.search = stringifyQuery(parseQuery(parsed.search));
  });
}

/**
 * Resolves multiple URL segments into a single URL.
 *
 * @example
 *
 * ```js
 * resolveURL("http://foo.com/foo?test=123#token", "bar", "baz");
 * // Returns "http://foo.com/foo/bar/baz?test=123#token"
 * ```
 *
 * @group utils
 */
export function resolveURL<
  const Base extends string,
  const Inputs extends readonly string[],
>(base: Base, ...inputs: Inputs): Refine<Base, ResolveURL<Base, Inputs>>;
export function resolveURL(base?: string, ...inputs: string[]): string;
export function resolveURL(base = "", ...inputs: string[]): string {
  if (typeof base !== "string") {
    throw new TypeError(
      `URL input should be string received ${typeof base as string} (${String(base)})`,
    );
  }

  const filteredInputs = inputs.filter(input => isNonEmptyURL(input));

  if (filteredInputs.length === 0) {
    return base;
  }

  const url = parseURL(base);

  for (const inputSegment of filteredInputs) {
    const urlSegment = parseURL(inputSegment);

    // Append path
    if (urlSegment.pathname) {
      url.pathname
        = withTrailingSlash(url.pathname)
          + withoutLeadingSlash(urlSegment.pathname);
    }

    // Override hash
    if (urlSegment.hash && urlSegment.hash !== "#") {
      url.hash = urlSegment.hash;
    }

    // Append search
    if (urlSegment.search && urlSegment.search !== "?") {
      if (url.search && url.search !== "?") {
        const queryString = stringifyQuery({
          ...parseQuery(url.search),
          ...parseQuery(urlSegment.search),
        });
        url.search = queryString.length > 0 ? `?${queryString}` : "";
      }
      else {
        url.search = urlSegment.search;
      }
    }
  }

  return stringifyParsedURL(url);
}
