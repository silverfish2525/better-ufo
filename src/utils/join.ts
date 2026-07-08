import type { JoinRelativeURLResult, JoinURLResult } from "../_types";
import type { JoinURLOptions } from "./protocol";
import { normalizeProtocolRelative } from "./_modify";
import { isNonEmptyURL } from "./predicates";
import { hasProtocol } from "./protocol";
import { withTrailingSlash } from "./slash";

const JOIN_LEADING_SLASH_RE = /^\.?\//u;
const JOIN_SEGMENT_SPLIT_RE = /\/(?!\/)/u;

export function joinURL<const Base extends string, const Rest extends readonly string[]>(
  base: Base,
  ...input: Rest
): JoinURLResult<Base, Rest>;
export function joinURL(base: string, ...input: string[]): string;
export function joinURL(base: string, ...input: [...string[], JoinURLOptions]): string;
export function joinURL(base: string, ...input: (string | JoinURLOptions)[]): string {
  let opts: JoinURLOptions | undefined = undefined;
  const last = input.at(-1);
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- defensive null check, matches upstream unjs/ufo
  if (last !== null && typeof last === "object" && !Array.isArray(last)) {
    opts = last;
    input = input.slice(0, -1);
  }

  const segments = input
    .filter((v): v is string => typeof v === "string")
    .filter((url) => isNonEmptyURL(url));
  let url = base || "";

  for (const segment of segments) {
    if (url) {
      const seg = segment.replace(JOIN_LEADING_SLASH_RE, "");
      url = withTrailingSlash(url) + seg;
    } else {
      url = segment;
    }
  }

  return normalizeProtocolRelative(url, base, opts);
}

/**
 * Joins multiple URL segments into a single URL and also handles relative paths with `./` and `../`.
 *
 * @example
 *
 * ```js
 * joinRelativeURL("/a", "../b", "./c"); // "/b/c"
 * ```
 *
 * @group utils
 */
export function joinRelativeURL<const Base extends string, const Rest extends readonly string[]>(
  base: Base,
  ...input: Rest
): JoinRelativeURLResult<Base, Rest>;
export function joinRelativeURL(...parts: string[]): string;
// oxlint-disable-next-line eslint/complexity -- URL segment-joining algorithm inherently branches on protocol/relative/.. cases
export function joinRelativeURL(...parts: string[]): string {
  const input = parts.filter(Boolean);

  const segments: string[] = [];

  let segmentsDepth = 0;

  for (const i of input) {
    if (!i || i === "/") {
      continue;
    }
    for (const [sindex, s] of i.split(JOIN_SEGMENT_SPLIT_RE).entries()) {
      if (!s || s === ".") {
        continue;
      }
      if (s === "..") {
        if (segments.length === 1 && hasProtocol(segments[0] ?? "")) {
          continue;
        }
        segments.pop();
        segmentsDepth -= 1;
        continue;
      }

      if (sindex === 1 && segments.at(-1)?.endsWith(":/") === true) {
        segments[segments.length - 1] += `/${s}`;
        continue;
      }
      segments.push(s);
      segmentsDepth += 1;
    }
  }

  let url = segments.join("/");

  if (segmentsDepth >= 0) {
    if (input[0]?.startsWith("/") === true && !url.startsWith("/")) {
      url = `/${url}`;
    } else if (input[0]?.startsWith("./") === true && !url.startsWith("./")) {
      url = `./${url}`;
    }
  } else {
    url = "../".repeat(-1 * segmentsDepth) + url;
  }

  if (input.at(-1)?.endsWith("/") === true && !url.endsWith("/")) {
    url += "/";
  }

  return url;
}
