import type { QueryValue } from "./_types";
import { toASCII } from "./punycode";

const SLASH_RE = /\//gu;
const PLUS_RE = /\+/gu;

const ENC_PIPE_RE = /%7c/giu;
const ENC_SPACE_RE = /%20/gu;
const ENC_SLASH_RE = /%2f/giu;
const ENC_ENC_SLASH_RE = /%252f/giu;
const ENC_HASH_RESTORE_RE = /%(?:5e|7b|7d)/giu;
const ENC_HASH_RESTORE_MAP: Readonly<Record<string, string>> = Object.freeze({
  "%5e": "^",
  "%7b": "{",
  "%7d": "}",
});
const RAW_QUERY_ENCODE_RE = /[!#$&'(),/:;=?@|~]/gu;
const RAW_QUERY_ENCODE_MAP: Readonly<Record<string, string>> = Object.freeze({
  "!": "%21",
  "#": "%23",
  $: "%24",
  "&": "%26",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  ",": "%2C",
  "/": "%2F",
  ":": "%3A",
  ";": "%3B",
  "=": "%3D",
  "?": "%3F",
  "@": "%40",
  "|": "%7C",
  "~": "%7E",
});
const RAW_PATH_ENCODE_RE = /[#&+?]/gu;
const RAW_PATH_ENCODE_MAP: Readonly<Record<string, string>> = Object.freeze({
  "#": "%23",
  "&": "%26",
  "+": "%2B",
  "?": "%3F",
});
function lookupCaseInsensitive(table: Readonly<Record<string, string>>, match: string): string {
  return table[match.toLowerCase()] ?? match;
}

/**
 * Encodes characters that need to be encoded in the path, search and hash
 * sections of the URL.
 *
 * @group encoding_utils
 *
 * @param text - string to encode
 * @returns encoded string
 */
export function encode(text: string | number): string {
  return encodeURI(`${text}`).replace(ENC_PIPE_RE, "|");
}

/**
 * Encodes characters that need to be encoded in the hash section of the URL.
 *
 * @group encoding_utils
 *
 * @param text - string to encode
 * @returns encoded string
 */
export function encodeHash(text: string): string {
  return encode(text).replace(ENC_HASH_RESTORE_RE, (m) =>
    lookupCaseInsensitive(ENC_HASH_RESTORE_MAP, m),
  );
}

/**
 * Encodes characters that need to be encoded for query values in the query
 * section of the URL.
 *
 * @group encoding_utils
 *
 * @param input - string to encode
 * @returns encoded string
 */
export function encodeQueryValue(input: QueryValue): string {
  return (
    encode(typeof input === "string" ? input : JSON.stringify(input))
      .replace(PLUS_RE, "%2B")
      .replace(ENC_SPACE_RE, "+")
      // After encodeURI. `*` is in the map for parity but maps to itself (spec-exempt).
      .replace(RAW_QUERY_ENCODE_RE, (c) => RAW_QUERY_ENCODE_MAP[c] ?? c)
  );
}

/**
 * Encodes characters that need to be encoded for query values in the query
 * section of the URL and also encodes the `=` character.
 *
 * @group encoding_utils
 *
 * @param text - string to encode
 * @returns The percent-encoded query key string.
 */
export function encodeQueryKey(text: string | number): string {
  return encodeQueryValue(text);
}

/**
 * Encodes characters that need to be encoded in the path section of the URL.
 *
 * @group encoding_utils
 *
 * @param text - string to encode
 * @returns encoded string
 */
export function encodePath(text: string | number): string {
  return encode(text)
    .replace(ENC_ENC_SLASH_RE, "%2F")
    .replace(RAW_PATH_ENCODE_RE, (c) => RAW_PATH_ENCODE_MAP[c] ?? c);
}

/**
 * Encodes characters that need to be encoded in the path section of the URL as a
 * param. This function encodes everything `encodePath` does plus the
 * slash (`/`) character.
 *
 * @group encoding_utils
 *
 * @param text - string to encode
 * @returns encoded string
 */
export function encodeParam(text: string | number): string {
  return encodePath(text).replace(SLASH_RE, "%2F");
}

/**
 * Decodes text using `decodeURIComponent`. Returns the original text if it
 * fails.
 *
 * @group encoding_utils
 *
 * @param text - string to decode
 * @returns decoded string
 */
export function decode(text: string | number = ""): string {
  try {
    return decodeURIComponent(`${text}`);
  } catch {
    return `${text}`;
  }
}

/**
 * Decodes path section of URL (consistent with encodePath for slash encoding).
 *
 * @group encoding_utils
 *
 * @param text - string to decode
 * @returns decoded string
 */
export function decodePath(text: string): string {
  return decode(text.replace(ENC_SLASH_RE, "%252F"));
}

/**
 * Decodes query key (consistent with `encodeQueryKey` for plus encoding).
 *
 * @group encoding_utils
 *
 * @param text - string to decode
 * @returns decoded string
 */
export function decodeQueryKey(text: string): string {
  return decode(text.replace(PLUS_RE, " "));
}

/**
 * Decodes query value (consistent with `encodeQueryValue` for plus encoding).
 *
 * @group encoding_utils
 *
 * @param text - string to decode
 * @returns decoded string
 */
export function decodeQueryValue(text: string): string {
  return decode(text.replace(PLUS_RE, " "));
}

/**
 * Encodes hostname with punycode encoding, then percent-encodes the four
 * authority-structural characters (`/`, `?`, `#`, `@`) so a decoded host
 * cannot leak into path/query/fragment/userinfo slots when the host is
 * re-serialized (SEC-20: normalizeURL host round-trip).
 *
 * @group encoding_utils
 */
const HOST_STRUCTURAL_RE = /[/?#@]/gu;
const HOST_STRUCTURAL_ENCODE: Readonly<Record<string, string>> = Object.freeze({
  "#": "%23",
  "/": "%2F",
  "?": "%3F",
  "@": "%40",
});
function encodeHostStructural(c: string): string {
  return HOST_STRUCTURAL_ENCODE[c] ?? c;
}

export function encodeHost(name = ""): string {
  return toASCII(name).replace(HOST_STRUCTURAL_RE, encodeHostStructural);
}
