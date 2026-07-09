import type { QueryObject, QueryValue, StringifyQueryItem, StringifyQueryResult } from "./_types";
import { decodeQueryKey, decodeQueryValue, encodeQueryKey, encodeQueryValue } from "./encoding";

export type { QueryObject, QueryValue } from "./_types";

export type ParsedQuery = Record<string, string | string[]>;
const AMPERSAND_CHAR_CODE = 38;
const EQUAL_CHAR_CODE = 61;

// Blocks prototype-pollution (PR #289 by @pi0, PR #331 by @saripovdenis).
const DANGEROUS_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

function appendQueryParameter(object: ParsedQuery, rawKey: string, rawValue: string): void {
  const key = decodeQueryKey(rawKey);
  if (DANGEROUS_KEYS.has(key)) {
    return;
  }
  const value = decodeQueryValue(rawValue);
  const existing = object[key];
  if (existing === undefined) {
    object[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    object[key] = [existing, value];
  }
}

/**
 * Parses and decodes a query string into an object.
 *
 * The input can be a query string with or without the leading `?`.
 *
 * @example
 *
 * ```js
 * parseQuery("?foo=bar&baz=qux");
 * // { foo: "bar", baz: "qux" }
 *
 * parseQuery("tags=javascript&tags=web&tags=dev");
 * // { tags: ["javascript", "web", "dev"] }
 * ```
 *
 * @note
 * The `__proto__`, `constructor`, and `prototype` keys are ignored to prevent
 * prototype pollution. Empty-key parameters (`=b`, `==`) preserve their value
 * under an empty-string key, matching WHATWG `URLSearchParams`.
 *
 * @group Query_utils
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public API: callers can specify return type
export function parseQuery<T extends ParsedQuery = ParsedQuery>(parametersString?: string): T;
export function parseQuery(parametersString?: string): ParsedQuery;
export function parseQuery(parametersString = ""): ParsedQuery {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.create(null) returns any; intentional for prototype-pollution safety
  const object = Object.create(null) as ParsedQuery;
  let keyStart = -1;
  let keyEnd = -1;
  const stringLength = parametersString.length;

  for (let index = parametersString.startsWith("?") ? 1 : 0; index <= stringLength; index += 1) {
    const isEnd = index === stringLength;
    const character = isEnd ? AMPERSAND_CHAR_CODE : parametersString.codePointAt(index);

    if (character === AMPERSAND_CHAR_CODE) {
      if (keyStart !== -1) {
        appendQueryParameter(
          object,
          parametersString.slice(keyStart, keyEnd === -1 ? index : keyEnd),
          keyEnd === -1 ? "" : parametersString.slice(keyEnd + 1, index),
        );
      } else if (keyEnd !== -1) {
        appendQueryParameter(object, "", parametersString.slice(keyEnd + 1, index));
      }
      keyStart = -1;
      keyEnd = -1;
      continue;
    }

    if (character === EQUAL_CHAR_CODE) {
      if (keyEnd === -1) {
        keyEnd = index;
      }
      // Subsequent `=` chars are treated as part of the value (matches URLSearchParams).
      continue;
    }

    if (keyStart === -1) {
      keyStart = index;
    }
  }
  return object;
}

/**
 * Encodes a pair of key and value into a url query string value.
 *
 * If the value is an array, it will be encoded as multiple key-value pairs with the same key.
 *
 * @example
 *
 * ```js
 * encodeQueryItem('message', 'Hello World')
 * // 'message=Hello+World'
 *
 * encodeQueryItem('tags', ['javascript', 'web', 'dev'])
 * // 'tags=javascript&tags=web&tags=dev'
 * ```
 *
 * @group Query_utils
 */
export function encodeQueryItem<const K extends string, const V extends QueryValue | QueryValue[]>(
  key: K,
  value: V,
): StringifyQueryItem<K, V>;
export function encodeQueryItem(key: string, value: QueryValue | QueryValue[]): string;
export function encodeQueryItem(key: string, value: QueryValue | QueryValue[]): string {
  let normalizedValue: QueryValue | QueryValue[] = value;
  if (typeof normalizedValue === "number" || typeof normalizedValue === "boolean") {
    normalizedValue = String(normalizedValue);
  }

  if (Array.isArray(normalizedValue)) {
    return normalizedValue
      .map(
        (_value: QueryValue) =>
          `${encodeQueryKey(key)}=${_value === null || _value === undefined || _value === "" ? "" : encodeQueryValue(_value)}`,
      )
      .join("&");
  }

  if (normalizedValue === undefined) {
    return "";
  }

  if (normalizedValue === null || normalizedValue === "") {
    return `${encodeQueryKey(key)}=`;
  }

  return `${encodeQueryKey(key)}=${encodeQueryValue(normalizedValue)}`;
}

/**
 * Stringfies and encodes a query object into a query string.
 *
 * @example
 *
 * ```js
 * stringifyQuery({ foo: 'bar', baz: 'qux' })
 * // 'foo=bar&baz=qux'
 *
 * stringifyQuery({ foo: 'bar', baz: undefined })
 * // 'foo=bar'
 * ```
 *
 * @group Query_utils
 */
export function stringifyQuery<const T extends QueryObject>(query: T): StringifyQueryResult<T>;
export function stringifyQuery(query: QueryObject): string;
export function stringifyQuery(query: QueryObject): string {
  // Single-pass builder (PR #333 by @saripovdenis).
  let result = "";
  for (const key in query) {
    if (!Object.hasOwn(query, key)) {
      continue;
    }
    const value: QueryValue | QueryValue[] = query[key];
    if (value === undefined) {
      continue;
    }
    const item = encodeQueryItem(key, value);
    if (item) {
      result += result ? `&${item}` : item;
    }
  }
  return result;
}
