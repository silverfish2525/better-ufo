import type { StringifyQueryItem, StringifyQueryResult } from "./_types";
import {
  decodeQueryKey,
  decodeQueryValue,
  encodeQueryKey,
  encodeQueryValue,
} from "./encoding";

export type QueryValue
  = | string
    | number
    | undefined
    | null
    | boolean
    | Array<QueryValue>
    | Record<string, any>;

export type QueryObject = Record<string, QueryValue | QueryValue[]>;

export type ParsedQuery = Record<string, string | string[]>;
const AMPERSAND_CHAR_CODE = 38;
const EQUAL_CHAR_CODE = 61;

// Blocks prototype-pollution (PR #289 by @pi0, PR #331 by @saripovdenis).
const DANGEROUS_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function appendQueryParameter(
  object: ParsedQuery,
  rawKey: string,
  rawValue: string,
): void {
  const key = decodeQueryKey(rawKey);
  if (DANGEROUS_KEYS.has(key)) {
    return;
  }
  const value = decodeQueryValue(rawValue);
  const existing = object[key];
  if (existing === undefined) {
    object[key] = value;
  }
  else if (Array.isArray(existing)) {
    existing.push(value);
  }
  else {
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
export function parseQuery<T extends ParsedQuery = ParsedQuery>(
  parametersString?: string,
): T;
export function parseQuery(parametersString?: string): ParsedQuery;
export function parseQuery(parametersString = ""): ParsedQuery {
  // TODO(v2): Use EmptyObject() for better perf (see unjs/ufo#290).
  const object = Object.create(null) as ParsedQuery;
  let keyStart = -1;
  let keyEnd = -1;
  const stringLength = parametersString.length;

  for (
    let index = parametersString[0] === "?" ? 1 : 0;
    index <= stringLength;
    index++
  ) {
    const isEnd = index === stringLength;
    const character = isEnd
      ? AMPERSAND_CHAR_CODE
      : parametersString.charCodeAt(index);

    if (character === AMPERSAND_CHAR_CODE) {
      if (keyStart !== -1) {
        appendQueryParameter(
          object,
          parametersString.slice(keyStart, keyEnd === -1 ? index : keyEnd),
          keyEnd === -1 ? "" : parametersString.slice(keyEnd + 1, index),
        );
      }
      else if (keyEnd !== -1) {
        appendQueryParameter(
          object,
          "",
          parametersString.slice(keyEnd + 1, index),
        );
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
export function encodeQueryItem<
  const K extends string,
  const V extends QueryValue | QueryValue[],
>(key: K, value: V): StringifyQueryItem<K, V>;
export function encodeQueryItem(
  key: string,
  value: QueryValue | QueryValue[],
): string;
export function encodeQueryItem(
  key: string,
  value: QueryValue | QueryValue[],
): string {
  if (typeof value === "number" || typeof value === "boolean") {
    value = String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(
        (_value: QueryValue) =>
          `${encodeQueryKey(key)}=${_value == null || _value === "" ? "" : encodeQueryValue(_value)}`,
      )
      .join("&");
  }

  if (value === undefined) {
    return "";
  }

  if (value === null || value === "") {
    return `${encodeQueryKey(key)}=`;
  }

  return `${encodeQueryKey(key)}=${encodeQueryValue(value)}`;
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
export function stringifyQuery<const T extends QueryObject>(
  query: T,
): StringifyQueryResult<T>;
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
