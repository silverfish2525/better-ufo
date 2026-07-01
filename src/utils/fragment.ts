import type { Refine, WithFragment, WithoutFragment } from "../_types";
import { encodeHash } from "../encoding";
import { modifyParsedURL } from "./_modify";

/**
 * Adds or replaces the fragment section of the URL.
 *
 * @example
 *
 * ```js
 * withFragment("/foo", "bar"); // "/foo#bar"
 * withFragment("/foo#bar", "baz"); // "/foo#baz"
 * withFragment("/foo#bar", ""); // "/foo"
 * ```
 *
 * @group utils
 */
export function withFragment<
  const Input extends string,
  const Hash extends string,
>(input: Input, hash: Hash): Refine<Input, WithFragment<Input, Hash>>;
export function withFragment(input: string, hash: string): string;
export function withFragment(input: string, hash: string): string {
  if (hash === "" || hash === "#") {
    return withoutFragment(input);
  }
  const hashIdx = input.indexOf("#");
  const preHash = hashIdx === -1 ? input : input.slice(0, hashIdx);
  if (
    !/[A-Z\\]/.test(preHash) // no uppercase, no backslash
    && !/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/\//.test(preHash)
  ) {
    return `${preHash}#${encodeHash(hash)}`;
  }
  return modifyParsedURL(input, (parsed) => {
    parsed.hash = hash === "" ? "" : `#${encodeHash(hash)}`;
  });
}

/**
 * Removes the fragment section from the URL.
 *
 * @example
 *
 * ```js
 * withoutFragment("http://example.com/foo?q=123#bar")
 * // Returns "http://example.com/foo?q=123"
 * ```
 *
 * @group utils
 */
export function withoutFragment<const S extends string>(
  input: S,
): Refine<S, WithoutFragment<S>>;
export function withoutFragment(input: string): string;
export function withoutFragment(input: string): string {
  if (
    !input.includes("#")
    && !/[A-Z\\]/.test(input)
    && !/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/\//.test(input)
  ) {
    return input;
  }
  return modifyParsedURL(input, (parsed) => {
    parsed.hash = "";
  });
}
