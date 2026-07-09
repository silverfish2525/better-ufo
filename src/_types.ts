/**
 * Type-level utilities for `better-ufo`.
 *
 * Every function in `better-ufo` is a pure `string -> string` (or `string -> struct`)
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

export type QueryValue =
  | string
  | number
  | undefined
  | null
  | boolean
  | QueryValue[]
  // oxlint-disable-next-line typescript/no-explicit-any -- `unknown` breaks literal-preserving key ordering in type-level tests
  | Record<string, any>;

export type QueryObject = Record<string, QueryValue | QueryValue[]>;

/**
 * `true` when `S` is a concrete string literal (or a union of them), `false`
 * for the wide `string` type. This is the switch that keeps every refinement
 * backwards compatible: dynamic strings fall back to the base type.
 */
export type IsStringLiteral<S> = [S] extends [string] ? (string extends S ? false : true) : false;

/**
 * Return `Computed` only when `S` is a string literal, otherwise `Base`
 * (defaults to `string`). This is the single guard used by every string
 * transform in `better-ufo`.
 */
export type Refine<S extends string, Computed, Base = string> =
  IsStringLiteral<S> extends true ? Computed : Base;

/** `true` only when every element of the tuple is a string literal. */
type AllStringLiteral<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? IsStringLiteral<Head> extends true
    ? Rest extends readonly unknown[]
      ? AllStringLiteral<Rest>
      : true
    : false
  : true;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

type LastOf<T> =
  UnionToIntersection<T extends unknown ? () => T : never> extends () => infer R ? R : never;

/** Convert a union of literals into a tuple, preserving declaration order. */
type UnionToTuple<T, L = LastOf<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L & T];

/** Ensure a single leading slash. */
export type WithLeadingSlash<S extends string> = S extends `/${string}` ? S : `/${S}`;

/** Remove one leading slash (empty result becomes `/`). */
export type WithoutLeadingSlash<S extends string> = S extends `/${infer R}`
  ? R extends ""
    ? "/"
    : R
  : S extends ""
    ? "/"
    : S;

/** Ensure a single trailing slash. */
export type WithTrailingSlash<S extends string> = S extends `${string}/` ? S : `${S}/`;

/** Remove one trailing slash (empty result becomes `/`). */
export type WithoutTrailingSlash<S extends string> = S extends `${infer R}/`
  ? R extends ""
    ? "/"
    : R
  : S extends ""
    ? "/"
    : S;

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

/**
 * Strip a leading `scheme://` or protocol-relative `//` prefix. Mirrors the
 * runtime `PROTOCOL_REGEX` for the common cases; leaves anything else intact.
 */
type StripLeadingProtocol<S extends string> = S extends `${string}://${infer R}`
  ? R
  : S extends `//${infer R}`
    ? R
    : S;

/** Replace the protocol of `S` with `P`. */
export type WithProtocol<S extends string, P extends string> = `${P}${StripLeadingProtocol<S>}`;

export type WithoutFragment<S extends string> = S extends `${infer Before}#${string}` ? Before : S;

/**
 * Strip the query string (`?...`) from a URL literal, preserving path and
 * fragment. Base + fragment are re-joined losslessly.
 */
export type WithoutQuery<S extends string> = S extends `${infer Head}?${infer Rest}`
  ? Rest extends `${string}#${infer Frag}`
    ? `${Head}#${Frag}`
    : Head
  : S;

export type WithFragment<Input extends string, Hash extends string> = Hash extends "" | "#"
  ? Input
  : IsUrlSafe<Hash> extends false
    ? string
    : Input extends `${infer Before}#${string}`
      ? `${Before}#${Hash}`
      : `${Input}#${Hash}`;

/** Remove `scheme://host` prefix, keeping pathname + search + hash. */
export type WithoutHost<Input extends string> = Input extends `${string}://${infer Rest}`
  ? SplitHostPath<Rest> extends [string, infer PathPart extends string]
    ? PathPart extends `/${string}`
      ? PathPart
      : `/${PathPart}`
    : string
  : string;

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
 * Characters `better-ufo` passes through URL-encoding untouched (RFC-3986 unreserved).
 * Restricting precision to these guarantees the literal type never disagrees
 * with the encoded runtime output; anything else degrades to `string`.
 */
type UrlSafeChar = LowerAlpha | UpperAlpha | Digit | "-" | "_" | "." | "~";

/** `true` only when every character of `S` is URL-safe (unreserved). */
type IsUrlSafe<S extends string> = S extends ""
  ? true
  : S extends `${infer C}${infer Rest}`
    ? C extends UrlSafeChar
      ? IsUrlSafe<Rest>
      : false
    : false;

/**
 * Stringify a single `key`/`value` pair exactly as `encodeQueryItem` does for
 * URL-safe inputs. Degrades to `string` when encoding would change the bytes.
 */
export type StringifyQueryItem<K extends string, V> =
  IsUrlSafe<K> extends false
    ? string
    : V extends null
      ? `${K}=`
      : V extends ""
        ? `${K}=`
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
> = Keys extends readonly [infer K, ...infer Rest]
  ? K extends keyof T & string
    ? T[K] extends undefined
      ? QueryParts<T, Rest>
      : [StringifyQueryItem<K, T[K]>, ...QueryParts<T, Rest>]
    : QueryParts<T, Rest>
  : [];

type JoinQueryParts<
  Parts extends readonly string[],
  Acc extends string = "",
> = Parts extends readonly [infer Head extends string, ...infer Rest extends readonly string[]]
  ? JoinQueryParts<Rest, Acc extends "" ? Head : `${Acc}&${Head}`>
  : Acc;

/**
 * The literal query string produced by `stringifyQuery(T)`.
 *
 * Precise for 0 or 1 emitted parts. Degrades to `string` for 2+ parts:
 * TypeScript does not expose stable object-declaration order via `keyof`,
 * and typechecker frontends (tsc, Vitest's experimental typecheck runner)
 * can disagree on the resulting tuple order. Rather than emit a literal
 * that some checkers see as wrong, widen to `string` at 2+ parts.
 */
type StringifyQuery<T> =
  QueryParts<T> extends readonly [string, string, ...unknown[]]
    ? string
    : JoinQueryParts<QueryParts<T>>;

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

type StripJoinLeadingSlash<S extends string> = S extends `./${infer R}`
  ? R
  : S extends `/${infer R}`
    ? R
    : S;

type FilterJoinSegments<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? Head extends "" | "/"
    ? FilterJoinSegments<Rest>
    : [Head, ...FilterJoinSegments<Rest>]
  : [];

type JoinStep<Url extends string, Seg extends string> = Url extends ""
  ? Seg
  : `${WithTrailingSlash<Url>}${StripJoinLeadingSlash<Seg>}`;

type FoldJoin<Url extends string, T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? FoldJoin<JoinStep<Url, Head>, Rest>
  : Url;

/** The literal URL produced by `joinURL(base, ...input)`. */
export type JoinURL<Base extends string, Rest extends readonly string[]> = FoldJoin<
  Base extends "" ? "" : Base,
  FilterJoinSegments<Rest>
>;

export type JoinURLResult<Base extends string, Rest extends readonly string[]> =
  IsStringLiteral<Base> extends true
    ? AllStringLiteral<Rest> extends true
      ? JoinURL<Base, Rest>
      : string
    : string;

/**
 * Result type for `joinRelativeURL`. Identical semantics to `JoinURLResult`
 * since `joinRelativeURL` uses the same segment-joining logic.
 */
export type JoinRelativeURLResult<
  Base extends string,
  Rest extends readonly string[],
> = JoinURLResult<Base, Rest>;

/**
 * Result type for `cleanDoubleSlashes`.
 *
 * Precise when the input's path portion contains no consecutive slashes —
 * i.e. the function is a no-op and the literal is returned unchanged.
 * Falls back to `string` whenever `//` is present in the path, since the
 * regex-replacement cannot be computed at the type level.
 *
 * The guard splits on `://` to skip the scheme separator, then checks for
 * `//` in the remainder (path). Query and fragment are always preserved
 * verbatim, which is handled correctly by the identity branch.
 */
export type CleanDoubleSlashes<S extends string> =
  IsStringLiteral<S> extends true
    ? S extends `${string}://${infer Rest}`
      ? Rest extends `${string}//${string}`
        ? string
        : S
      : S extends `${string}//${string}`
        ? string
        : S
    : string;

/**
 * Detects whether a string literal contains characters that could cause
 * `normalizeURL` / `stringifyQuery` to re-serialize the input differently
 * from the raw form. Any of these triggers a runtime-dependent output shape:
 *
 *   - `%` — percent triple. Would be decoded then re-encoded; the case of
 *     the hex digits, or a decode-of-safe-char, changes the output.
 *   - `?` — search slot. `parseQuery` → `stringifyQuery` roundtrip may
 *     reorder / re-encode entries.
 *   - Uppercase A-Z inside what could be a host (IDN normalization changes case)
 *     is intentionally NOT flagged — covered by IsUrlSafe.
 *
 * The check is intentionally conservative: any input passing this predicate
 * is guaranteed to round-trip; inputs failing it degrade to `string`.
 */
type HasNormalizeAmbiguity<S extends string> = S extends
  | `${string}%${string}`
  | `${string}?${string}`
  ? true
  : IsUrlSafe<S> extends true
    ? false
    : true;

/**
 * Type-level result for `normalizeURL(input)`. Provably an identity for
 * literals that contain no `%`, no `?`, and only URL-safe characters;
 * otherwise falls back to `string` because the runtime may re-encode or
 * re-serialize.
 */
export type NormalizeURL<S extends string> =
  IsStringLiteral<S> extends true ? (HasNormalizeAmbiguity<S> extends true ? string : S) : string;

/**
 * Type-level result for `resolveURL(base, ...inputs)`. If no additional
 * inputs are given, the base is returned unchanged; otherwise the merged
 * path/query cannot be computed at the type level and falls back to `string`.
 *
 * The `AllInputsEmpty` check catches `resolveURL(x, "", "")` — whitespace-only
 * / empty segments are filtered by `isNonEmptyURL` at runtime, so the base
 * survives untouched.
 */
export type ResolveURL<Base extends string, Inputs extends readonly string[]> =
  IsStringLiteral<Base> extends true
    ? Inputs extends readonly []
      ? Base
      : AllInputsEmpty<Inputs> extends true
        ? Base
        : string
    : string;

type AllInputsEmpty<Inputs extends readonly string[]> = Inputs extends readonly [
  infer Head,
  ...infer Tail extends readonly string[],
]
  ? Head extends ""
    ? AllInputsEmpty<Tail>
    : false
  : true;

type SplitHostPath<S extends string, Host extends string = ""> = S extends `${infer C}${infer Rest}`
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
export type ParseURL<S extends string> = S extends `${infer Proto}://${infer Rest}`
  ? Proto extends `${string}${"/" | "?" | "#" | ":" | " "}${string}`
    ? ParsedURLBase
    : SplitHostPath<Rest> extends [infer Host extends string, infer PathPart extends string]
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
      ? F extends `${infer L}.${infer R}`
        ? L extends ""
          ? undefined
          : R extends ""
            ? undefined
            : F
        : undefined
      : F extends ""
        ? undefined
        : F
    : undefined
  : undefined;

type LastSegment<S extends string> = S extends `${string}/${infer Rest}` ? LastSegment<Rest> : S;

/** Strip a single trailing colon, mirroring the runtime `.replace(/:$/, "")`. */
type StripTrailingColon<S extends string> = S extends `${infer Head}:` ? Head : S;

/**
 * `true` when `S` contains any character the isScriptProtocol runtime
 * normalizes away before the membership check — tab / newline / CR
 * (removed anywhere) or a leading space / NUL. When any is present we
 * cannot compute the result precisely at the type level, so callers
 * degrade to `boolean` instead of risking a wrong literal.
 */
type HasSchemeNoise<S extends string> = S extends
  | `${string}\t${string}`
  | `${string}\n${string}`
  | `${string}\r${string}`
  | ` ${string}`
  | `\0${string}`
  ? true
  : false;

/** WHATWG "special scheme" set — single source of truth mirrored from runtime. */
type SpecialSchemeName = "http" | "https" | "ws" | "wss" | "ftp" | "file";

/** Dangerous ("script") scheme set — mirrored from runtime SCRIPT_SCHEMES. */
type ScriptSchemeName = "blob" | "data" | "javascript" | "vbscript";

/**
 * Result type for `isSpecialScheme`.
 *
 * Runtime normalization is only `.toLowerCase().replace(/:$/, "")` — no
 * whitespace or control-char handling — so a literal input can always be
 * resolved to a precise `true` / `false`.
 */
export type IsSpecialScheme<S extends string> =
  IsStringLiteral<S> extends true
    ? Lowercase<StripTrailingColon<S>> extends SpecialSchemeName
      ? true
      : false
    : boolean;

/**
 * Result type for `isScriptProtocol`.
 *
 * Precise for "clean" literals; degrades to `boolean` when the input carries
 * scheme noise (tab / newline / CR / leading space / NUL) that the runtime
 * strips before the membership test. Note the runtime only strips a *trailing*
 * colon, so e.g. `"javascript:alert(1)"` is `false` (no trailing colon).
 */
export type IsScriptProtocol<S extends string> =
  IsStringLiteral<S> extends true
    ? HasSchemeNoise<S> extends true
      ? boolean
      : Lowercase<StripTrailingColon<S>> extends ScriptSchemeName
        ? true
        : false
    : boolean;
