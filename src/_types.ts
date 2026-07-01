/**
 * Type-level utilities for ufo.
 *
 * Every function in ufo is a pure `string -> string` (or `string -> struct`)
 * transform, which makes the whole surface an ideal target for template-literal
 * types. The helpers here let each public function compute its *exact* result
 * type when called with a string (or object) **literal**, while degrading to the
 * original wide type (`string`, `boolean`, `ParsedURL`, ...) for dynamic inputs.
 *
 * The guard is always the same: {@link IsStringLiteral}. If the input is not a
 * concrete literal, the refined type collapses to its base type, so existing
 * callers that pass dynamic strings observe **no change** in inferred types.
 *
 * This module is intentionally not re-exported wholesale from the barrel; the
 * curated public helper types are re-exported from `index.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Literal detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `true` when `S` is a concrete string literal (or a union of them), `false`
 * for the wide `string` type. This is the switch that keeps every refinement
 * backwards compatible: dynamic strings fall back to the base type.
 */
export type IsStringLiteral<S> = [S] extends [string]
  ? string extends S
    ? false
    : true
  : false;

/**
 * Return `Computed` only when `S` is a string literal, otherwise `Base`
 * (defaults to `string`). This is the single guard used by every string
 * transform in ufo.
 */
export type Refine<S extends string, Computed, Base = string> =
  IsStringLiteral<S> extends true ? Computed : Base;

/** `true` only when every element of the tuple is a string literal. */
export type AllStringLiteral<T extends readonly unknown[]> = T extends [
  infer Head,
  ...infer Rest,
]
  ? IsStringLiteral<Head> extends true
    ? AllStringLiteral<Rest>
    : false
  : true;

/* -------------------------------------------------------------------------- */
/* Union -> tuple (preserves key declaration order for query stringifying)    */
/* -------------------------------------------------------------------------- */

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

type LastOf<T> =
  UnionToIntersection<T extends unknown ? () => T : never> extends () => infer R
    ? R
    : never;

/** Convert a union of literals into a tuple, preserving declaration order. */
export type UnionToTuple<T, L = LastOf<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L & T];

/* -------------------------------------------------------------------------- */
/* Slash transforms                                                           */
/* -------------------------------------------------------------------------- */

/** Ensure a single leading slash. */
export type WithLeadingSlash<S extends string> = S extends `/${string}`
  ? S
  : `/${S}`;

/** Remove one leading slash (empty result becomes `/`). */
export type WithoutLeadingSlash<S extends string> = S extends `/${infer R}`
  ? R extends ""
    ? "/"
    : R
  : S extends ""
    ? "/"
    : S;

/** Ensure a single trailing slash. */
export type WithTrailingSlash<S extends string> = S extends `${string}/`
  ? S
  : `${S}/`;

/** Remove one trailing slash (empty result becomes `/`). */
export type WithoutTrailingSlash<S extends string> = S extends `${infer R}/`
  ? R extends ""
    ? "/"
    : R
  : S extends ""
    ? "/"
    : S;

/* -------------------------------------------------------------------------- */
/* Slash / relative predicates                                                */
/* -------------------------------------------------------------------------- */

/** `true`/`false` literal for a literal input, `boolean` otherwise. */
export type HasLeadingSlash<S extends string> = Refine<
  S,
  S extends `/${string}` ? true : false,
  boolean
>;

export type HasTrailingSlash<S extends string> = Refine<
  S,
  S extends `${string}/` ? true : false,
  boolean
>;

export type IsRelative<S extends string> = Refine<
  S,
  S extends `./${string}` | `../${string}` ? true : false,
  boolean
>;

/* -------------------------------------------------------------------------- */
/* Protocol transforms                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Strip a leading `scheme://` or protocol-relative `//` prefix. Mirrors the
 * runtime `PROTOCOL_REGEX` for the common cases; leaves anything else intact.
 */
export type StripLeadingProtocol<S extends string> =
  S extends `${string}://${infer R}` ? R : S extends `//${infer R}` ? R : S;

/** Replace the protocol of `S` with `P`. */
export type WithProtocol<
  S extends string,
  P extends string,
> = `${P}${StripLeadingProtocol<S>}`;

/* -------------------------------------------------------------------------- */
/* Fragment / host transforms                                                 */
/* -------------------------------------------------------------------------- */

export type WithoutFragment<S extends string> =
  S extends `${infer Before}#${string}` ? Before : S;

/**
 * Strip the query string (`?...`) from a URL literal, preserving path and
 * fragment. Base + fragment are re-joined losslessly.
 */
export type WithoutQuery<S extends string> =
  S extends `${infer Head}?${infer Rest}`
    ? Rest extends `${string}#${infer Frag}`
      ? `${Head}#${Frag}`
      : Head
    : S;

export type WithFragment<
  Input extends string,
  Hash extends string,
> = Hash extends "" | "#"
  ? Input
  : IsUrlSafe<Hash> extends false
    ? string
    : Input extends `${infer Before}#${string}`
      ? `${Before}#${Hash}`
      : `${Input}#${Hash}`;

/** Remove `scheme://host` prefix, keeping pathname + search + hash. */
export type WithoutHost<Input extends string> =
  Input extends `${string}://${infer Rest}`
    ? SplitHostPath<Rest> extends [string, infer PathPart extends string]
      ? PathPart extends `/${string}`
        ? PathPart
        : `/${PathPart}`
      : string
    : string;

/* -------------------------------------------------------------------------- */
/* URL-safe char detection (for query / fragment precision)                   */
/* -------------------------------------------------------------------------- */

type LowerAlpha =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type UpperAlpha =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/**
 * Characters ufo passes through URL-encoding untouched (RFC-3986 unreserved).
 * Restricting precision to these guarantees the literal type never disagrees
 * with the encoded runtime output; anything else degrades to `string`.
 */
type UrlSafeChar = LowerAlpha | UpperAlpha | Digit | "-" | "_" | "." | "~";

/** `true` only when every character of `S` is URL-safe (unreserved). */
export type IsUrlSafe<S extends string> = S extends ""
  ? true
  : S extends `${infer C}${infer Rest}`
    ? C extends UrlSafeChar
      ? IsUrlSafe<Rest>
      : false
    : false;

/* -------------------------------------------------------------------------- */
/* Query stringifying                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Stringify a single `key`/`value` pair exactly as `encodeQueryItem` does for
 * URL-safe inputs. Degrades to `string` when encoding would change the bytes.
 */
export type StringifyQueryItem<K extends string, V> =
  IsUrlSafe<K> extends false
    ? string
    : V extends null
      ? K
      : V extends ""
        ? K
        : V extends string
          ? IsUrlSafe<V> extends true
            ? `${K}=${V}`
            : string
          : V extends number
            ? `${K}=${V}`
            : V extends boolean
              ? `${K}=${V}`
              : string;

type QueryParts<
  T,
  Keys extends readonly unknown[] = UnionToTuple<keyof T>,
> = Keys extends [infer K, ...infer Rest]
  ? K extends keyof T & string
    ? T[K] extends undefined
      ? QueryParts<T, Rest>
      : [StringifyQueryItem<K, T[K]>, ...QueryParts<T, Rest>]
    : QueryParts<T, Rest>
  : [];

type JoinQueryParts<
  Parts extends readonly string[],
  Acc extends string = "",
> = Parts extends [infer Head extends string, ...infer Rest extends string[]]
  ? JoinQueryParts<Rest, Acc extends "" ? Head : `${Acc}&${Head}`>
  : Acc;

/** The literal query string produced by `stringifyQuery(T)`. */
export type StringifyQuery<T> = JoinQueryParts<QueryParts<T>>;

/** Public-facing result type: precise for object literals, `string` otherwise. */
export type StringifyQueryResult<T> =
  IsStringLiteral<keyof T & string> extends true ? StringifyQuery<T> : string;

/**
 * Result of `withQuery(input, query)`. Precise when `input` has no existing
 * query/fragment (the common "add query to a clean base" case); `string`
 * otherwise, matching runtime behaviour exactly.
 */
export type WithQueryResult<Input extends string, Q> =
  IsStringLiteral<Input> extends true
    ? Input extends `${string}${"?" | "#"}${string}`
      ? string
      : StringifyQueryResult<Q> extends infer QS extends string
        ? QS extends ""
          ? Input
          : string extends QS
            ? string
            : `${Input}?${QS}`
        : string
    : string;

/* -------------------------------------------------------------------------- */
/* URL joining                                                                */
/* -------------------------------------------------------------------------- */

type StripJoinLeadingSlash<S extends string> = S extends `./${infer R}`
  ? R
  : S extends `/${infer R}`
    ? R
    : S;

type FilterJoinSegments<T extends readonly string[]> = T extends [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Head extends "" | "/"
    ? FilterJoinSegments<Rest>
    : [Head, ...FilterJoinSegments<Rest>]
  : [];

type JoinStep<Url extends string, Seg extends string> = Url extends ""
  ? Seg
  : `${WithTrailingSlash<Url>}${StripJoinLeadingSlash<Seg>}`;

type FoldJoin<Url extends string, T extends readonly string[]> = T extends [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? FoldJoin<JoinStep<Url, Head>, Rest>
  : Url;

/** The literal URL produced by `joinURL(base, ...input)`. */
export type JoinURL<
  Base extends string,
  Rest extends readonly string[],
> = FoldJoin<Base extends "" ? "" : Base, FilterJoinSegments<Rest>>;

export type JoinURLResult<Base extends string, Rest extends readonly string[]> =
  IsStringLiteral<Base> extends true
    ? AllStringLiteral<Rest> extends true
      ? JoinURL<Base, Rest>
      : string
    : string;

/* -------------------------------------------------------------------------- */
/* URL / path parsing                                                         */
/* -------------------------------------------------------------------------- */

type SplitHostPath<
  S extends string,
  Host extends string = "",
> = S extends `${infer C}${infer Rest}`
  ? C extends "/" | "?" | "#"
    ? [Host, S]
    : SplitHostPath<Rest, `${Host}${C}`>
  : [Host, ""];

/** Parsed `{ pathname, search, hash }` of a path/URL string literal. */
export type ParsePath<S extends string> = S extends `${infer Before}#${infer H}`
  ? ParseSearch<Before> & { hash: `#${H}` }
  : ParseSearch<S> & { hash: "" };

type ParseSearch<S extends string> = S extends `${infer Path}?${infer Q}`
  ? { pathname: Path; search: `?${Q}` }
  : { pathname: S; search: "" };

/**
 * Parsed URL struct for a literal input. Precise for the common
 * `scheme://host/path?search#hash` shape (no auth); degrades to the base
 * `ParsedURLBase` for anything more exotic (auth, special/relative protocols).
 */
export type ParseURL<S extends string> =
  S extends `${infer Proto}://${infer Rest}`
    ? Proto extends `${string}${"/" | "?" | "#" | ":" | " "}${string}`
      ? ParsedURLBase
      : SplitHostPath<Rest> extends [
            infer Host extends string,
            infer PathPart extends string,
          ]
        ? Host extends `${string}@${string}`
          ? ParsedURLBase
          : ParsePath<PathPart> extends {
                pathname: infer P extends string;
                search: infer Se extends string;
                hash: infer H extends string;
              }
            ? {
                protocol: `${Lowercase<Proto>}:`;
                auth: "";
                host: Host;
                pathname: P;
                search: Se;
                hash: H;
              }
            : ParsedURLBase
        : ParsedURLBase
    : ParsedURLBase;

/**
 * Widened `ParsedURL` shape used as the fallback for {@link ParseURL}. Kept in
 * sync with the `ParsedURL` interface in `parse.ts` (minus the internal
 * `protocolRelative` symbol, which is not part of the literal refinement).
 */
export interface ParsedURLBase {
  protocol?: string;
  host?: string;
  auth?: string;
  href?: string;
  pathname: string;
  hash: string;
  search: string;
}

/** Last path segment (filename) of a URL literal, or `undefined`. */
export type ParseFilename<
  S extends string,
  Strict extends boolean = false,
> = ParsePath<S>["pathname"] extends infer P extends string
  ? LastSegment<P> extends infer F extends string
    ? Strict extends true
      ? F extends `${string}.${string}`
        ? F
        : undefined
      : F extends ""
        ? undefined
        : F
    : undefined
  : undefined;

type LastSegment<S extends string> = S extends `${string}/${infer Rest}`
  ? LastSegment<Rest>
  : S;
