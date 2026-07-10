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
  | readonly QueryValue[]
  // oxlint-disable-next-line typescript/no-explicit-any -- `unknown` breaks literal-preserving key ordering in type-level tests
  | Record<string, any>;

export type QueryObject = Record<string, QueryValue | QueryValue[] | readonly QueryValue[]>;

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

type QueryKeyLiteral<K extends string> = EncodeQueryResult<K>;

/**
 * Dispatch a single scalar value `V` (already stripped of any array shape) to
 * its encoded literal, given a pre-computed encoded key `EK`. Distributes
 * over unions: `null | "bar"` yields `` `${EK}=` | `${EK}=bar` ``,
 * `undefined | "bar"` yields the drop-mode empty for the `undefined` branch
 * or `` `${EK}=` `` under empty mode.
 */
type StringifyQueryScalarDispatch<
  EK extends string,
  V,
  UndefinedMode extends "drop" | "empty",
> = V extends undefined
  ? UndefinedMode extends "drop"
    ? ""
    : `${EK}=`
  : V extends null
    ? `${EK}=`
    : V extends ""
      ? `${EK}=`
      : V extends string
        ? string extends V
          ? string
          : EncodeQueryResult<V> extends infer EV extends string
            ? string extends EV
              ? string
              : `${EK}=${EV}`
            : string
        : V extends number
          ? number extends V
            ? string
            : EncodeQueryResult<`${V}`> extends infer EV extends string
              ? string extends EV
                ? string
                : `${EK}=${EV}`
              : string
          : V extends boolean
            ? boolean extends V
              ? string
              : `${EK}=${V}`
            : string;

/**
 * Stringify a single scalar (non-array) value for a given key.
 * `UndefinedMode` mirrors runtime: within an array element `undefined` emits
 * `key=`, outside an array `encodeQueryItem` returns `""` (dropped by
 * `stringifyQuery`).
 *
 * Value dispatch is delegated to {@link StringifyQueryScalarDispatch} so it
 * distributes over unions such as `null | "bar"` or `undefined | "bar"`.
 */
type StringifyQueryScalar<K extends string, V, UndefinedMode extends "drop" | "empty"> =
  QueryKeyLiteral<K> extends infer EncodedKey extends string
    ? string extends EncodedKey
      ? string
      : StringifyQueryScalarDispatch<EncodedKey, V, UndefinedMode>
    : string;

/** Prepend `Part` to `Rest`, dropping the entry when `Part` is `""`. */
type AddQueryPart<Part extends string, Rest extends readonly string[]> = Part extends ""
  ? Rest
  : [Part, ...Rest];

/**
 * Fold a readonly tuple of array-element values through `StringifyQueryScalar`
 * with `UndefinedMode = "empty"` (matches runtime `encodeQueryItem` on arrays),
 * joining the parts with `&`. Non-tuple arrays (`readonly V[]` with unknown
 * length) widen to `string`.
 */
type StringifyQueryArrayItems<
  K extends string,
  V extends readonly unknown[],
  Acc extends string = "",
> = number extends V["length"]
  ? string
  : V extends readonly [infer Head, ...infer Tail]
    ? StringifyQueryScalar<K, Head, "empty"> extends infer Part extends string
      ? string extends Part
        ? string
        : StringifyQueryArrayItems<
            K,
            Tail extends readonly unknown[] ? Tail : [],
            Acc extends "" ? Part : `${Acc}&${Part}`
          >
      : string
    : Acc;

/**
 * Stringify a single `key`/`value` pair exactly as `encodeQueryItem` does.
 * Percent-encodes the key and the value using {@link EncodeQueryResult}.
 * Arrays fold left-to-right; non-tuple arrays widen to `string`.
 */
export type StringifyQueryItem<K extends string, V> = V extends readonly unknown[]
  ? V extends readonly []
    ? ""
    : StringifyQueryArrayItems<K, V>
  : StringifyQueryScalar<K, V, "drop">;

type QueryParts<
  T,
  Keys extends readonly unknown[] = UnionToTuple<keyof T>,
> = Keys extends readonly [infer K, ...infer Rest]
  ? K extends keyof T & string
    ? StringifyQueryItem<K, T[K]> extends infer Part extends string
      ? AddQueryPart<Part, Rest extends readonly unknown[] ? QueryParts<T, Rest> : []>
      : QueryParts<T, Rest extends readonly unknown[] ? Rest : []>
    : QueryParts<T, Rest extends readonly unknown[] ? Rest : []>
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
 *
 * The detector uses `Parts extends [string, string, ...unknown[]]` under a
 * distributive `infer Parts`; unions of tuples with mixed lengths (produced
 * by optional / union-valued fields where one branch is dropped) widen
 * whenever ANY branch has ≥2 parts.
 */
type StringifyQuery<T> =
  QueryParts<T> extends infer Parts extends readonly string[]
    ? true extends (Parts extends readonly [string, string, ...unknown[]] ? true : false)
      ? string
      : JoinQueryParts<Parts>
    : string;

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

/**
 * Result type for `filterQuery(input, predicate)`. When the input has no
 * `?`, the runtime short-circuits and returns it verbatim; otherwise the
 * callback is evaluated at runtime, so the result widens to `string`.
 */
export type FilterQueryResult<S extends string> =
  IsStringLiteral<S> extends true ? (S extends `${string}?${string}` ? string : S) : string;

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
 * `true` when `S` contains a shape the type-level dot-segment fold does not
 * model (`//` runs or `://` protocol) — those go through a runtime regex/protocol
 * guard path we choose not to replicate here, so the whole result widens.
 */
type HasJoinRelativeUnmodeled<S extends string> = S extends
  | `${string}//${string}`
  | `${string}://${string}`
  ? true
  : false;

type AnyJoinRelativeUnmodeled<Parts extends readonly string[]> = Parts extends readonly [
  infer H extends string,
  ...infer T extends readonly string[],
]
  ? HasJoinRelativeUnmodeled<H> extends true
    ? true
    : AnyJoinRelativeUnmodeled<T>
  : false;

/** Split a modeled path part on `/` (no `//` runs, per {@link HasJoinRelativeUnmodeled}). */
type SplitRelativePart<
  S extends string,
  Acc extends readonly string[] = [],
> = S extends `${infer H}/${infer R}` ? SplitRelativePart<R, [...Acc, H]> : [...Acc, S];

/**
 * Push a single split segment through the fold.
 *
 * - `""` and `"."` are skipped.
 * - `".."` pops the physical stack if non-empty (mirrors runtime
 *   `segments.pop()`); otherwise it grows the Underflow tuple (each entry
 *   represents a runtime `segmentsDepth -= 1` past zero).
 * - Any other segment pushes onto the stack. Underflow is left untouched here;
 *   final-depth reconciliation happens in {@link ExtraUnderflow}, which
 *   pairwise cancels stack entries against underflow entries — this preserves
 *   the signed `segmentsDepth` semantics without needing an explicit counter.
 */
type PushRelativeSegment<
  Stack extends readonly string[],
  Underflow extends readonly unknown[],
  Segment extends string,
> = Segment extends "" | "."
  ? [Stack, Underflow]
  : Segment extends ".."
    ? Stack extends readonly [...infer Init extends readonly string[], string]
      ? [Init, Underflow]
      : [Stack, [...Underflow, unknown]]
    : [[...Stack, Segment], Underflow];

type FoldPartSegments<
  Segments extends readonly string[],
  Stack extends readonly string[],
  Underflow extends readonly unknown[],
> = Segments extends readonly [infer H extends string, ...infer T extends readonly string[]]
  ? PushRelativeSegment<Stack, Underflow, H> extends [
      infer NewStack extends readonly string[],
      infer NewUnderflow extends readonly unknown[],
    ]
    ? FoldPartSegments<T, NewStack, NewUnderflow>
    : [Stack, Underflow]
  : [Stack, Underflow];

/**
 * Fold every truthy-filtered input part through the runtime segment loop,
 * preserving order. `"/"` is treated the same as `""` inside the loop (runtime
 * `if (i === "/") continue`), but the caller passes only the `filter(Boolean)`
 * result so `First` / `Last` prefix detection is not confused by empty inputs.
 */
type FoldRelativeParts<
  Parts extends readonly string[],
  Stack extends readonly string[] = [],
  Underflow extends readonly unknown[] = [],
> = Parts extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? Head extends "" | "/"
    ? FoldRelativeParts<Tail, Stack, Underflow>
    : FoldPartSegments<SplitRelativePart<Head>, Stack, Underflow> extends [
          infer NewStack extends readonly string[],
          infer NewUnderflow extends readonly unknown[],
        ]
      ? FoldRelativeParts<Tail, NewStack, NewUnderflow>
      : [Stack, Underflow]
  : [Stack, Underflow];

type JoinSlashParts<
  Parts extends readonly string[],
  Acc extends string = "",
> = Parts extends readonly [infer H extends string, ...infer T extends readonly string[]]
  ? JoinSlashParts<T, Acc extends "" ? H : `${Acc}/${H}`>
  : Acc;

type RepeatDotDot<
  Underflow extends readonly unknown[],
  Acc extends string = "",
> = Underflow extends readonly [unknown, ...infer T] ? RepeatDotDot<T, `${Acc}../`> : Acc;

/** Last element of a string tuple, or `""` for empty tuple. */
type LastStringOfTuple<T extends readonly string[]> = T extends readonly [
  ...unknown[],
  infer L extends string,
]
  ? L
  : "";

/**
 * Filter falsy (empty-string) inputs out of a tuple to mirror the runtime
 * `parts.filter(Boolean)`. `"/"` is truthy and is kept — it participates in
 * `First` / `Last` detection even though the inner fold skips it.
 */
type FilterTruthyParts<T extends readonly string[]> = T extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? H extends ""
    ? FilterTruthyParts<R>
    : [H, ...FilterTruthyParts<R>]
  : [];

/**
 * Pairwise-cancel Stack entries against Underflow entries. The remaining
 * Underflow entries (if any) represent the final `-segmentsDepth` when the
 * runtime signed depth is negative — matching runtime `"../".repeat(...)`
 * output. When Underflow is exhausted first, the depth was ≥ 0 and no
 * leading `../` prefix is emitted.
 */
type ExtraUnderflow<
  Stack extends readonly unknown[],
  Underflow extends readonly unknown[],
> = Stack extends readonly [unknown, ...infer ST extends readonly unknown[]]
  ? Underflow extends readonly [unknown, ...infer UT extends readonly unknown[]]
    ? ExtraUnderflow<ST, UT>
    : []
  : Underflow;

type ApplyRelativePrefix<Body extends string, First extends string> = First extends `/${string}`
  ? Body extends `/${string}`
    ? Body
    : `/${Body}`
  : First extends `./${string}`
    ? Body extends `./${string}`
      ? Body
      : `./${Body}`
    : Body;

type ApplyRelativeTrailing<Body extends string, Last extends string> = Last extends `${string}/`
  ? Body extends `${string}/`
    ? Body
    : `${Body}/`
  : Body;

type JoinRelativeURLLiteral<Base extends string, Rest extends readonly string[]> =
  AnyJoinRelativeUnmodeled<[Base, ...Rest]> extends true
    ? string
    : FilterTruthyParts<[Base, ...Rest]> extends infer Filtered extends readonly string[]
      ? Filtered extends readonly []
        ? ""
        : FoldRelativeParts<Filtered> extends [
              infer Stack extends readonly string[],
              infer Underflow extends readonly unknown[],
            ]
          ? ExtraUnderflow<Stack, Underflow> extends infer Extra extends readonly unknown[]
            ? (
                Extra extends readonly []
                  ? ApplyRelativePrefix<JoinSlashParts<Stack>, Filtered[0] & string>
                  : `${RepeatDotDot<Extra>}${JoinSlashParts<Stack>}`
              ) extends infer Body extends string
              ? ApplyRelativeTrailing<Body, LastStringOfTuple<Filtered>>
              : string
            : string
          : string
      : string;

/**
 * Result type for `joinRelativeURL(base, ...rest)`. Models the runtime
 * segment split + dot-segment fold for pure literal inputs; widens to
 * `string` when any modeled part contains `//` or `://`, when Base or any
 * Rest is dynamic, or when the stack fold cannot be reduced.
 */
export type JoinRelativeURLResult<Base extends string, Rest extends readonly string[]> =
  IsStringLiteral<Base> extends true
    ? AllStringLiteral<Rest> extends true
      ? JoinRelativeURLLiteral<Base, Rest>
      : string
    : string;

/**
 * Split `S` at the first `?` or `#`, returning `[PathBeforeQueryOrHash, Rest]`
 * where `Rest` still includes the terminator character. When neither
 * terminator appears, returns `[S, ""]`.
 */
type SplitAtQueryOrHash<
  S extends string,
  Path extends string = "",
> = S extends `${infer C}${infer Rest}`
  ? C extends "?" | "#"
    ? [Path, S]
    : SplitAtQueryOrHash<Rest, `${Path}${C}`>
  : [Path, ""];

/** Collapse every run of `//`, `///`, ... to a single `/`. */
type CollapseSlashRuns<S extends string> = S extends `${infer A}//${infer B}`
  ? CollapseSlashRuns<`${A}/${B}`>
  : S;

/**
 * Recursively collapse slash runs in the path portion, splitting on each
 * `://` so the scheme separator survives.
 */
type CleanDoubleSlashPath<S extends string> = S extends `${infer Head}://${infer Tail}`
  ? `${CollapseSlashRuns<Head>}://${CleanDoubleSlashPath<Tail>}`
  : CollapseSlashRuns<S>;

type CleanDoubleSlashesLiteral<S extends string> =
  SplitAtQueryOrHash<S> extends [infer Path extends string, infer Rest extends string]
    ? `${CleanDoubleSlashPath<Path>}${Rest}`
    : string;

/**
 * Result type for `cleanDoubleSlashes`. Mirrors runtime exactly: splits at the
 * first `?`/`#`, collapses `/{2,}` in the path (preserving each `://`
 * separator), then re-appends the untouched query/fragment tail.
 */
export type CleanDoubleSlashes<S extends string> = Refine<S, CleanDoubleSlashesLiteral<S>>;

/** Strip a leading `?` from a search string, or return as-is. */
type StripSearchPrefix<S extends string> = S extends `?${infer Body}` ? Body : S;

/**
 * `parsed.search = stringifyQuery(parseQuery(parsed.search))` — the parseQuery
 * side already strips a leading `?`, and stringifyQuery emits no leading `?`,
 * so we re-add it when the round-tripped body is non-empty.
 */
type NormalizeURLSearch<S extends string> = S extends "" | "?"
  ? ""
  : ParseQueryResult<StripSearchPrefix<S>> extends infer Q
    ? StringifyQueryResult<Q> extends infer QS extends string
      ? string extends QS
        ? string
        : QS extends ""
          ? ""
          : `?${QS}`
      : string
    : string;

/** `parsed.pathname = encodePath(decodePath(parsed.pathname))`. */
type NormalizePathname<P extends string> =
  DecodePathResult<P> extends infer D extends string
    ? string extends D
      ? string
      : EncodePathResult<D>
    : string;

/** `parsed.hash = encodeHash(decode(parsed.hash))`. */
type NormalizeHash<H extends string> =
  DecodeResult<H> extends infer D extends string
    ? string extends D
      ? string
      : EncodeHashResult<D>
    : string;

/** `parsed.host = encodeHost(decode(parsed.host))`. */
type NormalizeHost<H extends string> =
  DecodeResult<H> extends infer D extends string
    ? string extends D
      ? string
      : EncodeHostResult<D>
    : string;

/** Runtime: `auth === "" ? "" : `${auth}@``. */
type AuthPrefix<Auth extends string> = Auth extends "" ? "" : `${Auth}@`;

/**
 * Build the `${proto}${auth}${host}` prefix of a parsed URL exactly as
 * `stringifyParsedURL` does, including the `hasAuthority` logic that makes
 * an authority-less special scheme emit just `protocol:` (e.g. `mailto:`).
 */
type StringifyURLPrefix<State> = State extends {
  protocol: infer Proto extends string;
  host: infer Host extends string;
  auth: infer Auth extends string;
}
  ? string extends Proto
    ? string
    : string extends Host
      ? string
      : string extends Auth
        ? string
        : Proto extends ""
          ? State extends { protocolRelative: true }
            ? `//${AuthPrefix<Auth>}${Host}`
            : `${AuthPrefix<Auth>}${Host}`
          : Host extends ""
            ? Auth extends ""
              ? Proto
              : `${Proto}//${Auth}@`
            : `${Proto}//${AuthPrefix<Auth>}${Host}`
  : "";

/**
 * Runtime `stringifyParsedURL(parsed)` mirror for URL states.
 * Search is expected to be normalized to `""` or `?…` already.
 */
type StringifyURLState<State> = State extends {
  pathname: infer P extends string;
  search: infer Se extends string;
  hash: infer H extends string;
}
  ? string extends P
    ? string
    : string extends Se
      ? string
      : string extends H
        ? string
        : StringifyURLPrefix<State> extends infer Prefix extends string
          ? string extends Prefix
            ? string
            : `${Prefix}${P}${Se}${H}`
          : string
  : string;

/**
 * Apply the runtime `normalizeURL` slot rewrites to a parsed URL state.
 * Preserves protocol / auth / protocolRelative unchanged; rewrites
 * pathname / hash / host / search per the encoding pipeline.
 */
type NormalizeURLState<State> = State extends {
  pathname: infer P extends string;
  search: infer Se extends string;
  hash: infer H extends string;
}
  ? NormalizePathname<P> extends infer NP extends string
    ? NormalizeHash<H> extends infer NH extends string
      ? NormalizeURLSearch<Se> extends infer NS extends string
        ? State extends { host: infer Host extends string }
          ? NormalizeHost<Host> extends infer NHost extends string
            ? Omit<State, "pathname" | "search" | "hash" | "host"> & {
                pathname: NP;
                search: NS;
                hash: NH;
                host: NHost;
              }
            : ParsedURLBase
          : Omit<State, "pathname" | "search" | "hash"> & {
              pathname: NP;
              search: NS;
              hash: NH;
            }
        : ParsedURLBase
      : ParsedURLBase
    : ParsedURLBase
  : ParsedURLBase;

type NormalizeURLLiteral<S extends string> =
  ParseURLState<StripParseNoise<S>> extends infer State
    ? State extends ParsedURLBase
      ? StringifyURLState<NormalizeURLState<State>>
      : string
    : string;

/**
 * Type-level result for `normalizeURL(input)`. Slot-wise mirror of the
 * runtime pipeline: parse the URL into an internal state, rewrite the
 * pathname/hash/host/search slots through `decode`/`encode`, then stringify.
 */
export type NormalizeURL<S extends string> = Refine<S, NormalizeURLLiteral<S>>;

/** Empty-segment predicate mirroring runtime `isNonEmptyURL(url)`. */
type IsResolveNonEmpty<S extends string> = S extends "" | "/" ? false : true;

/**
 * Filter `inputs.filter((input) => isNonEmptyURL(input))` at the type level,
 * preserving tuple order.
 */
type FilterResolveInputs<Inputs extends readonly string[]> = Inputs extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? IsResolveNonEmpty<Head> extends true
    ? [Head, ...FilterResolveInputs<Tail>]
    : FilterResolveInputs<Tail>
  : [];

/**
 * `url.pathname = withTrailingSlash(url.pathname) + withoutLeadingSlash(segment.pathname)`,
 * skipping the append entirely when the segment has no path.
 */
type AppendResolvePath<BasePath extends string, SegPath extends string> = SegPath extends ""
  ? BasePath
  : `${WithTrailingSlash<BasePath>}${WithoutLeadingSlash<SegPath>}`;

/** `{ ...base, ...segment }` at the type level; segment wins on collisions. */
type MergeQueryObjects<Base, Segment> = Prettify<Omit<Base, keyof Segment> & Segment>;

/**
 * Runtime search-merge rule mirrored for the type level:
 *   • segment empty (`""` / `"?"`)             → keep base search
 *   • segment non-empty, base empty            → adopt segment search verbatim
 *   • both non-empty                           → parse both, `{...base, ...seg}`,
 *                                                stringify; widen if either
 *                                                round-trip widens.
 */
type MergeResolveSearch<BaseSearch extends string, SegSearch extends string> = SegSearch extends
  | ""
  | "?"
  ? BaseSearch
  : BaseSearch extends "" | "?"
    ? SegSearch
    : ParseQueryResult<StripSearchPrefix<BaseSearch>> extends infer Base
      ? ParseQueryResult<StripSearchPrefix<SegSearch>> extends infer Seg
        ? MergeQueryObjects<Base, Seg> extends infer Merged
          ? StringifyQueryResult<Merged> extends infer QS extends string
            ? string extends QS
              ? string
              : QS extends ""
                ? ""
                : `?${QS}`
            : string
          : string
        : string
      : string;

/**
 * Apply one resolve step: append pathname, override hash, merge search. The
 * runtime keeps protocol / auth / host / protocolRelative from the base state.
 */
type ResolveState<State, Segment> = State extends {
  pathname: infer BP extends string;
  search: infer BS extends string;
  hash: infer BH extends string;
}
  ? Segment extends {
      pathname: infer SP extends string;
      search: infer SS extends string;
      hash: infer SH extends string;
    }
    ? Omit<State, "pathname" | "search" | "hash"> & {
        pathname: SP extends "" ? BP : AppendResolvePath<BP, SP>;
        search: MergeResolveSearch<BS, SS>;
        hash: SH extends "" | "#" ? BH : SH;
      }
    : ParsedURLBase
  : ParsedURLBase;

/** Fold ResolveState across every filtered segment, preserving order. */
type FoldResolveState<State, Inputs extends readonly string[]> = Inputs extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? ParseURLState<StripParseNoise<Head>> extends infer Seg
    ? Seg extends ParsedURLBase
      ? FoldResolveState<ResolveState<State, Seg>, Tail>
      : ParsedURLBase
    : ParsedURLBase
  : State;

type ResolveURLLiteral<Base extends string, Inputs extends readonly string[]> =
  FilterResolveInputs<Inputs> extends infer Filtered extends readonly string[]
    ? Filtered extends readonly []
      ? Base
      : ParseURLState<StripParseNoise<Base>> extends infer State
        ? State extends ParsedURLBase
          ? StringifyURLState<FoldResolveState<State, Filtered>>
          : string
        : string
    : string;

/**
 * Type-level result for `resolveURL(base, ...inputs)`. Folds each non-empty
 * input into the base's parsed state — appending pathname, overriding hash,
 * and merging query with the runtime's `{ ...base, ...segment }` semantics —
 * before stringifying. Multi-key merged queries widen to `string`.
 */
export type ResolveURL<Base extends string, Inputs extends readonly string[]> =
  IsStringLiteral<Base> extends true
    ? AllStringLiteral<Inputs> extends true
      ? ResolveURLLiteral<Base, Inputs>
      : string
    : string;

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
 * Parsed URL struct for a literal input. Refines the same branches the
 * runtime `parseURL` implements (script scheme, authority URL with optional
 * auth, opaque URI, protocol-relative, plain relative path) and falls back
 * to `ParsedURLBase` for anything not modeled at the type level.
 */
export type ParseURL<S extends string> =
  IsStringLiteral<S> extends true
    ? PublicParseURL<ParseURLState<StripParseNoise<S>>>
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

// ---------------------------------------------------------------------------
// Private URL-state parsing helpers backing ParseURL / NormalizeURL / ResolveURL.
//
// Runtime source of truth: `src/parse.ts` — see the comments on individual
// Helpers for the exact branch each one models.
// ---------------------------------------------------------------------------

/** Recursive substring replace. `From = ""` is a no-op to avoid infinite recursion. */
type ReplaceAll<S extends string, From extends string, To extends string> = From extends ""
  ? S
  : S extends `${infer Head}${From}${infer Tail}`
    ? ReplaceAll<`${Head}${To}${Tail}`, From, To>
    : S;

/**
 * Runtime `input.replaceAll(/[\t\n\r]/gu, "")`. Strips the three whitespace
 * characters the WHATWG URL parser is required to remove before scanning.
 */
type StripParseNoise<S extends string> = ReplaceAll<
  ReplaceAll<ReplaceAll<S, "\t", "">, "\n", "">,
  "\r",
  ""
>;

type SchemeChar = LowerAlpha | UpperAlpha | Digit | "+" | "-" | ".";

/**
 * Scan the leading `scheme:` off `S`. Returns `[Scheme, Rest]` when the input
 * begins with 2+ scheme characters followed by `:`, else `false`. Whitespace
 * / NUL prefixes (which the runtime `[\s\0]*` regex tolerates) widen to
 * `false`; we return `ParsedURLBase` for those from `ParseURLState` rather
 * than emitting a wrong exact shape.
 *
 * `HasTwo` tracks whether at least two scheme characters have been consumed
 * so we can reject 1-char pseudo-schemes like `"h:"` — TypeScript template
 * literal patterns with only `${string}` slots trivially reduce to `string`
 * and cannot enforce a minimum length on their own.
 */
type ScanScheme<
  S extends string,
  Acc extends string = "",
  HasTwo extends boolean = false,
> = S extends `${infer C}${infer R}`
  ? C extends ":"
    ? HasTwo extends true
      ? [Acc, R]
      : false
    : Acc extends ""
      ? C extends LowerAlpha | UpperAlpha
        ? ScanScheme<R, C>
        : false
      : C extends SchemeChar
        ? ScanScheme<R, `${Acc}${C}`, true>
        : false
  : false;

/** WHATWG "special scheme" set — the runtime replaces `\` with `/` for these. */
type ParseSpecialScheme = "http" | "https" | "ws" | "wss" | "ftp" | "file";

/** Script scheme set — mirrors runtime `SCRIPT_SCHEMES`. */
type ParseScriptScheme = "blob" | "data" | "javascript" | "vbscript";

/**
 * Split an authority-and-path string at the first `/`, `?`, or `#`,
 * returning `[Authority, Tail]`. The tail retains the terminator character.
 */
type ParseAuthorityPath<
  S extends string,
  Authority extends string = "",
> = S extends `${infer C}${infer Rest}`
  ? C extends "/" | "?" | "#"
    ? [Authority, S]
    : ParseAuthorityPath<Rest, `${Authority}${C}`>
  : [Authority, ""];

/**
 * Split an authority slice at the LAST `@`, returning
 * `[AuthBeforeLastAt, HostAfterLastAt]`. When the authority contains no `@`
 * returns `["", S]`. Matches the runtime `lastIndexOf("@")` semantics.
 */
type SplitLastAt<S extends string> = S extends `${infer Before}@${infer After}`
  ? After extends `${string}@${string}`
    ? SplitLastAtInner<After, `${Before}@`>
    : [Before, After]
  : ["", S];

type SplitLastAtInner<
  S extends string,
  Acc extends string,
> = S extends `${infer Before}@${infer After}`
  ? After extends `${string}@${string}`
    ? SplitLastAtInner<After, `${Acc}${Before}@`>
    : [`${Acc}${Before}`, After]
  : ["", `${Acc}${S}`];

/**
 * Runtime `authoritySlice.replaceAll("@", "%40")` on the auth portion. Called
 * only after {@link SplitLastAt} has already located the terminating `@`.
 */
type ReplaceAuthAts<S extends string> = ReplaceAll<S, "@", "%40">;

/**
 * `path.replace(/\/(?=[A-Z]:)/iu, "")`, applied only for `file:` URLs. The
 * runtime regex is case-insensitive on the drive letter, so lowercase drives
 * are stripped too.
 */
type NormalizeFilePathPrefix<P extends string> = P extends `/${infer Drive}:${infer Rest}`
  ? Drive extends LowerAlpha | UpperAlpha
    ? `${Drive}:${Rest}`
    : P
  : P;

/**
 * Internal parsed-URL shape used by normalize/resolve. Includes the
 * `protocolRelative` marker for `//x.io/a`-style inputs; the public
 * {@link ParseURL} strips this marker via {@link PublicParseURL}. Exported
 * only so cross-file type helpers within `src/` can reference the shape;
 * not re-exported from the barrel.
 */
export interface URLState {
  protocol?: string;
  host?: string;
  auth?: string;
  href?: string;
  pathname: string;
  search: string;
  hash: string;
  protocolRelative?: true;
}

/**
 * Strip the private `protocolRelative` marker from a parsed state so the
 * public shape matches the runtime `ParsedURL` output. `ParsedURLBase`
 * fallbacks pass through unchanged; everything else has the marker `Omit`ed
 * so a protocol-relative literal like `"//x.io/a"` returns the same visible
 * keys as an absolute URL.
 */
type PublicParseURL<State> = State extends { protocolRelative: true }
  ? Omit<State, "protocolRelative">
  : State;

/**
 * Parse a script-scheme URI (`blob:`, `data:`, `javascript:`, `vbscript:`)
 * to the same shape the runtime emits from `parseURL`.
 */
interface ParseScriptSchemeState<Scheme extends string, Rest extends string> {
  auth: "";
  hash: "";
  host: "";
  href: `${Scheme}:${Rest}`;
  pathname: Rest;
  protocol: `${Lowercase<Scheme>}:`;
  search: "";
}

/** Parse an opaque URI (`scheme:` NOT followed by `//`). */
type ParseOpaqueState<Scheme extends string, Rest extends string> =
  ParsePath<Rest> extends {
    pathname: infer P extends string;
    search: infer Se extends string;
    hash: infer H extends string;
  }
    ? {
        auth: "";
        hash: H;
        host: "";
        pathname: P;
        protocol: `${Lowercase<Scheme>}:`;
        search: Se;
      }
    : ParsedURLBase;

/**
 * Parse an authority URL: `scheme://…` or a protocol-relative `//…`.
 *
 * `Scheme` is `""` for protocol-relative inputs.
 */
type ParseAuthorityState<Scheme extends string, AfterAuthority extends string> =
  ParseAuthorityPath<AfterAuthority> extends [
    infer AuthHost extends string,
    infer Tail extends string,
  ]
    ? SplitLastAt<AuthHost> extends [infer AuthRaw extends string, infer Host extends string]
      ? ReplaceAuthAts<AuthRaw> extends infer Auth extends string
        ? Lowercase<Scheme> extends "file"
          ? ParsePath<NormalizeFilePathPrefix<Tail>> extends {
              pathname: infer P extends string;
              search: infer Se extends string;
              hash: infer H extends string;
            }
            ? BuildAuthorityState<Scheme, Auth, Host, P, Se, H>
            : ParsedURLBase
          : ParsePath<Tail> extends {
                pathname: infer P extends string;
                search: infer Se extends string;
                hash: infer H extends string;
              }
            ? BuildAuthorityState<Scheme, Auth, Host, P, Se, H>
            : ParsedURLBase
        : ParsedURLBase
      : ParsedURLBase
    : ParsedURLBase;

type BuildAuthorityState<
  Scheme extends string,
  Auth extends string,
  Host extends string,
  Pathname extends string,
  Search extends string,
  Hash extends string,
> = Scheme extends ""
  ? {
      auth: Auth;
      hash: Hash;
      host: Host;
      pathname: Pathname;
      protocol: "";
      protocolRelative: true;
      search: Search;
    }
  : {
      auth: Auth;
      hash: Hash;
      host: Host;
      pathname: Pathname;
      protocol: `${Lowercase<Scheme>}:`;
      search: Search;
    };

/**
 * Dispatch the appropriate branch based on the leading scheme (if any). This
 * mirrors the runtime `parseURL` branch order:
 *
 * 1. Script-scheme match (`blob:`, `data:`, `javascript:`, `vbscript:`).
 * 2. No protocol at all → {@link ParsePath} (relative path).
 * 3. `scheme:` not followed by `//` → opaque URI.
 * 4. `scheme://…` or `//…` → authority URL. Special schemes normalize
 *    backslashes to forward slashes first.
 */
/**
 * `true` when the input has a `:` appearing after at least 2 non-terminator
 * characters — matching the runtime `PROTOCOL_REGEX` minimum scheme length
 * (`[A-Z][\s\w\0+.-]+:`). Used to widen unmodeled scheme forms: the runtime
 * regex accepts `\w` (incl. `_`), whitespace, and NUL inside the scheme; our
 * {@link ScanScheme} only handles ASCII alnum plus `+.-`. When ScanScheme
 * fails but a schemeish colon exists, widen to `ParsedURLBase` rather than
 * mis-parse as a relative path. 1-char pseudo-schemes (`h:foo`) fall through
 * to `ParsePath` because the runtime also treats them as opaque paths.
 */
type HasSchemeishColon<
  S extends string,
  Acc extends readonly unknown[] = [],
> = S extends `${infer C}${infer R}`
  ? C extends ":"
    ? Acc extends readonly [unknown, unknown, ...unknown[]]
      ? true
      : false
    : C extends "/" | "?" | "#"
      ? false
      : HasSchemeishColon<R, [...Acc, unknown]>
  : false;

type ParseURLState<S extends string> = S extends ` ${string}` | `\t${string}` | `\0${string}`
  ? ParsedURLBase
  : ScanScheme<S> extends [infer Scheme extends string, infer AfterColon extends string]
    ? Lowercase<Scheme> extends ParseScriptScheme
      ? ParseScriptSchemeState<Scheme, AfterColon>
      : AfterColon extends `//${infer AfterAuthority}`
        ? Lowercase<Scheme> extends ParseSpecialScheme
          ? ParseAuthorityState<Scheme, ReplaceAll<AfterAuthority, "\\", "/">>
          : ParseAuthorityState<Scheme, AfterAuthority>
        : ParseOpaqueState<Scheme, AfterColon>
    : S extends `//${infer AfterAuthority}`
      ? ParseAuthorityState<"", AfterAuthority>
      : S extends `\\${string}` | `${string}\\${string}`
        ? ParsedURLBase
        : HasSchemeishColon<S> extends true
          ? ParsedURLBase
          : ParsePath<S>;

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

type PathParameterValue = string | number;

type Whitespace = " " | "\n" | "\t" | "\r";

type TrimLeft<S extends string> = S extends `${Whitespace}${infer R}` ? TrimLeft<R> : S;
type TrimRight<S extends string> = S extends `${infer R}${Whitespace}` ? TrimRight<R> : S;
type Trim<S extends string> = TrimLeft<TrimRight<S>>;

/**
 * Scan a `{name}` placeholder body. Consumes at least one character after `{`
 * before `}` can close, mirroring the runtime `open + 2` rule that keeps
 * `{}` non-matching and preserves the old `+?` regex semantics.
 */
type ScanPathParameter<
  S extends string,
  Key extends string = "",
> = S extends `${infer C}${infer Rest}`
  ? Key extends ""
    ? ScanPathParameter<Rest, C>
    : C extends "}"
      ? [key: Key, rest: Rest]
      : ScanPathParameter<Rest, `${Key}${C}`>
  : false;

/**
 * ASCII characters that pass through `encodeParam` verbatim. `encodeParam` is
 * `encodePath(...).replace(/\//g, "%2F")`; `encodePath` runs `encodeURI` (which
 * leaves unreserved chars and `!$'()*,:;=@` alone) and then percent-encodes
 * `#`, `&`, `+`, `?` and re-encodes any lingering `%2F`. `|` is decoded back
 * from `%7C` by `encode`. Everything else must widen to `string`.
 */
type EncodeParamUnchangedChar =
  | LowerAlpha
  | UpperAlpha
  | Digit
  | "-"
  | "_"
  | "."
  | "~"
  | "!"
  | "$"
  | "'"
  | "("
  | ")"
  | "*"
  | ","
  | ":"
  | ";"
  | "="
  | "@"
  | "|";

type EncodeParamChar<C extends string> = C extends EncodeParamUnchangedChar
  ? C
  : C extends " "
    ? "%20"
    : C extends "/"
      ? "%2F"
      : C extends "#"
        ? "%23"
        : C extends "&"
          ? "%26"
          : C extends "+"
            ? "%2B"
            : C extends "?"
              ? "%3F"
              : C extends "["
                ? "%5B"
                : C extends "]"
                  ? "%5D"
                  : C extends "{"
                    ? "%7B"
                    : C extends "}"
                      ? "%7D"
                      : C extends "^"
                        ? "%5E"
                        : C extends "`"
                          ? "%60"
                          : string;

type EncodeParamLiteral<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? EncodeParamChar<C> extends infer Encoded extends string
      ? string extends Encoded
        ? string
        : EncodeParamLiteral<Rest, `${Acc}${Encoded}`>
      : string
    : Acc;

type ResolvePathParameter<
  TrimmedKey extends string,
  RawKey extends string,
  Parameters extends Record<string, PathParameterValue>,
  OnMissing extends "leave" | "throw" | "empty",
> = TrimmedKey extends keyof Parameters
  ? Parameters[TrimmedKey] extends infer Value extends PathParameterValue
    ? Value extends string
      ? string extends Value
        ? string
        : EncodeParamLiteral<Value>
      : Value extends number
        ? number extends Value
          ? string
          : `${Value}`
        : string
    : string
  : OnMissing extends "empty"
    ? ""
    : OnMissing extends "throw"
      ? never
      : `{${RawKey}}`;

/**
 * Recursive scanner over the template. Branches on the `string` sentinel
 * *before* concatenation so a single wide substitution widens the whole
 * result rather than emitting a partial template type like
 * `` `/x/${string}/tail` ``.
 */
type ReplacePathParameters<
  S extends string,
  Parameters extends Record<string, PathParameterValue>,
  OnMissing extends "leave" | "throw" | "empty",
  Acc extends string = "",
> = S extends `${infer Before}{${infer Rest}`
  ? ScanPathParameter<Rest> extends [infer RawKey extends string, infer Tail extends string]
    ? ResolvePathParameter<Trim<RawKey>, RawKey, Parameters, OnMissing> extends infer Sub extends
        string
      ? string extends Sub
        ? string
        : ReplacePathParameters<Tail, Parameters, OnMissing, `${Acc}${Before}${Sub}`>
      : never
    : `${Acc}${Before}{${Rest}`
  : `${Acc}${S}`;

/**
 * Collect the set of placeholder keys from a template literal using the
 * default `{name}` scanner. Mirrors {@link ScanPathParameter}, so `{}` is
 * not a placeholder, `{a{b}` yields `"a{b"`, `{}b}` yields `"}b"`, and an
 * unclosed `{` contributes no key.
 */
type CollectPathParameterKeys<
  S extends string,
  Keys extends string = never,
> = S extends `${infer _Before}{${infer Rest}`
  ? ScanPathParameter<Rest> extends [infer RawKey extends string, infer Tail extends string]
    ? CollectPathParameterKeys<Tail, Keys | Trim<RawKey>>
    : Keys
  : Keys;

/**
 * Union of placeholder keys in a literal template under the default `{name}`
 * syntax. Widens to `string` for a dynamic template.
 */
export type ExtractPathParameters<Template extends string> =
  IsStringLiteral<Template> extends true ? CollectPathParameterKeys<Template> : string;

/**
 * Object shape required by `withPathParameters(template, parameters)` for a
 * literal template under the default interpolation syntax. Widens to
 * `Record<string, string | number>` when a custom `interpolate` regex may
 * bypass the default scanner or when the template is dynamic.
 */
export type PathParametersFor<
  Template extends string,
  Options extends { interpolate?: RegExp; onMissing?: "leave" | "throw" | "empty" } | undefined =
    undefined,
> =
  IsStringLiteral<Template> extends true
    ? PathParameterOptionsAllowDefault<Options> extends true
      ? [ExtractPathParameters<Template>] extends [never]
        ? Record<never, PathParameterValue>
        : Record<ExtractPathParameters<Template>, PathParameterValue>
      : Record<string, PathParameterValue>
    : Record<string, PathParameterValue>;

/**
 * Exactness wrapper: rejects extra object-literal keys not present in
 * {@link PathParametersFor}. `Parameters` must already satisfy the shape
 * required by the template + options, so this only forbids extras.
 */
export type ExactPathParameters<
  Template extends string,
  Parameters extends PathParametersFor<Template, Options>,
  Options extends { interpolate?: RegExp; onMissing?: "leave" | "throw" | "empty" } | undefined =
    undefined,
> = Parameters &
  Record<Exclude<keyof Parameters, keyof PathParametersFor<Template, Options>>, never>;

type PathParameterOptionsShape = { interpolate?: unknown; onMissing?: unknown } | undefined;

/**
 * `true` when the static options type proves the caller cannot supply a
 * custom `interpolate` regex. Conservative: a broad `RegExp` field, or the
 * wide `WithPathParametersOptions` type where `interpolate` may be `RegExp`,
 * forces widening because the runtime scanner is bypassed.
 */
type PathParameterInterpolateAllowsDefault<Options extends PathParameterOptionsShape> = [
  Options,
] extends [undefined]
  ? true
  : Options extends { interpolate?: infer Interpolate }
    ? "interpolate" extends keyof Options
      ? RegExp extends NonNullable<Interpolate>
        ? false
        : NonNullable<Interpolate> extends never
          ? true
          : Interpolate extends undefined
            ? true
            : false
      : true
    : true;

/**
 * `true` when the static `onMissing` is either absent or a required single
 * literal mode. An optional `onMissing?: "empty"` cannot be resolved
 * statically — the runtime default is `"leave"` — so it widens.
 */
type PathParameterOnMissingIsPrecise<Options extends PathParameterOptionsShape> = [
  Options,
] extends [undefined]
  ? true
  : Options extends { onMissing?: unknown }
    ? "onMissing" extends keyof Options
      ? Options extends { onMissing: "leave" | "throw" | "empty" }
        ? true
        : false
      : true
    : true;

type PathParameterOptionsAllowDefault<Options extends PathParameterOptionsShape> = [
  Options,
] extends [undefined]
  ? true
  : PathParameterInterpolateAllowsDefault<Options> extends true
    ? PathParameterOnMissingIsPrecise<Options>
    : false;

type PathParameterOnMissing<Options extends PathParameterOptionsShape> = [Options] extends [
  undefined,
]
  ? "leave"
  : Options extends { onMissing: infer Mode extends "leave" | "throw" | "empty" }
    ? Mode
    : "leave";

/**
 * Result of `withPathParameters(template, parameters, options?)`. Precise for
 * literal templates + literal parameter maps under the default `{name}`
 * syntax; degrades to `string` for dynamic templates, wide numbers, wide
 * strings, unmodeled characters, custom `interpolate`, or an options type
 * broad enough to permit either.
 */
export type WithPathParametersResult<
  Template extends string,
  Parameters extends Record<string, PathParameterValue>,
  Options extends { interpolate?: RegExp; onMissing?: "leave" | "throw" | "empty" } | undefined =
    undefined,
> =
  IsStringLiteral<Template> extends true
    ? PathParameterOptionsAllowDefault<Options> extends true
      ? ReplacePathParameters<Template, Parameters, PathParameterOnMissing<Options>>
      : string
    : string;

// ---------------------------------------------------------------------------
// Encoding helpers — literal-preserving char-by-char models of `src/encoding.ts`
// ---------------------------------------------------------------------------

/**
 * Characters `encodeURI` leaves alone: unreserved + reserved-that-URIs-use
 * (`;,/?:@&=+$#`). Any other ASCII becomes a percent-triple; non-ASCII becomes
 * a UTF-8 percent-triple sequence and widens at the type level.
 */
type EncodeUriUnchangedChar =
  | LowerAlpha
  | UpperAlpha
  | Digit
  | "-"
  | "_"
  | "."
  | "~"
  | "!"
  | "*"
  | "'"
  | "("
  | ")"
  | ";"
  | ","
  | "/"
  | "?"
  | ":"
  | "@"
  | "&"
  | "="
  | "+"
  | "$"
  | "#";

/** ASCII chars `encodeURI` percent-encodes and their fixed literal outputs. */
type EncodeUriEncodedChar<C extends string> = C extends " "
  ? "%20"
  : C extends '"'
    ? "%22"
    : C extends "<"
      ? "%3C"
      : C extends ">"
        ? "%3E"
        : C extends "\\"
          ? "%5C"
          : C extends "["
            ? "%5B"
            : C extends "]"
              ? "%5D"
              : C extends "^"
                ? "%5E"
                : C extends "`"
                  ? "%60"
                  : C extends "{"
                    ? "%7B"
                    : C extends "}"
                      ? "%7D"
                      : string;

/**
 * Per-char model of `encode(text)` = `encodeURI(text).replace(/%7c/gi, "|")`.
 * `|` is restored from `%7C` and joins the unchanged set. `%` is not in
 * `encodeURI`'s unescaped set, so every raw `%` is encoded to `%25`
 * (`encode("%20") === "%2520"`, verified via Node's `encodeURI`).
 */
type EncodeChar<C extends string> = C extends EncodeUriUnchangedChar | "|"
  ? C
  : C extends "%"
    ? "%25"
    : EncodeUriEncodedChar<C>;

type EncodeLiteral<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? EncodeChar<C> extends infer E extends string
      ? string extends E
        ? string
        : EncodeLiteral<Rest, `${Acc}${E}`>
      : string
    : Acc;

/** Helper: refined return of `encode(input)`. */
export type EncodeResult<S extends string> = Refine<S, EncodeLiteral<S>>;

/**
 * Per-char model of `encodeHash(text)` = `encode(text)` with `%5E/%7B/%7D`
 * restored to `^{}`. `%` still encodes to `%25` (the restore only touches
 * the three fixed triples above, not raw `%`).
 */
type EncodeHashChar<C extends string> = C extends EncodeUriUnchangedChar | "|" | "^" | "{" | "}"
  ? C
  : C extends "%"
    ? "%25"
    : C extends " "
      ? "%20"
      : C extends '"'
        ? "%22"
        : C extends "<"
          ? "%3C"
          : C extends ">"
            ? "%3E"
            : C extends "\\"
              ? "%5C"
              : C extends "["
                ? "%5B"
                : C extends "]"
                  ? "%5D"
                  : C extends "`"
                    ? "%60"
                    : string;

type EncodeHashLiteral<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? EncodeHashChar<C> extends infer E extends string
      ? string extends E
        ? string
        : EncodeHashLiteral<Rest, `${Acc}${E}`>
      : string
    : Acc;

/** Helper: refined return of `encodeHash(input)`. */
export type EncodeHashResult<S extends string> = Refine<S, EncodeHashLiteral<S>>;

/**
 * Per-char model of `encodePath(text)` = `encode(text)` + additional
 * encoding of `#&+?` and normalization of `%252F` → `%2F` (the latter only
 * fires when input already contains `%`, which widens anyway).
 */
type EncodePathChar<C extends string> = C extends "#"
  ? "%23"
  : C extends "&"
    ? "%26"
    : C extends "+"
      ? "%2B"
      : C extends "?"
        ? "%3F"
        : C extends EncodeUriUnchangedChar | "|"
          ? C
          : EncodeUriEncodedChar<C>;

type EncodePathLiteral<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? EncodePathChar<C> extends infer E extends string
      ? string extends E
        ? string
        : EncodePathLiteral<Rest, `${Acc}${E}`>
      : string
    : Acc;

/** Helper: refined return of `encodePath(input)`. */
export type EncodePathResult<S extends string> = Refine<S, EncodePathLiteral<S>>;

/**
 * Helper: refined return of `encodeParam(input)` — already modeled by the
 * private `EncodeParamLiteral` used by `withPathParameters`.
 */
export type EncodeParamResult<S extends string> = Refine<S, EncodeParamLiteral<S>>;

/**
 * Per-char model of `encodeQueryValue(input)` / `encodeQueryKey(input)`:
 *   `encode(text).replace(/\+/g, "%2B").replace(/%20/g, "+").replace(RAW_QUERY_RE, map)`
 *
 * Net effect per input char:
 *   space → "+", "+" → "%2B", and every char in `RAW_QUERY_ENCODE_MAP`
 *   (`!#$&'(),/:;=?@|~`) → its literal percent-triple. `*` and `-_.~`-adjacent
 *   chars are handled explicitly. Non-ASCII / `%` widen.
 */
type EncodeQueryChar<C extends string> = C extends " "
  ? "+"
  : C extends "+"
    ? "%2B"
    : C extends "!"
      ? "%21"
      : C extends "#"
        ? "%23"
        : C extends "$"
          ? "%24"
          : C extends "&"
            ? "%26"
            : C extends "'"
              ? "%27"
              : C extends "("
                ? "%28"
                : C extends ")"
                  ? "%29"
                  : C extends ","
                    ? "%2C"
                    : C extends "/"
                      ? "%2F"
                      : C extends ":"
                        ? "%3A"
                        : C extends ";"
                          ? "%3B"
                          : C extends "="
                            ? "%3D"
                            : C extends "?"
                              ? "%3F"
                              : C extends "@"
                                ? "%40"
                                : C extends "|"
                                  ? "%7C"
                                  : C extends "~"
                                    ? "%7E"
                                    : C extends LowerAlpha | UpperAlpha | Digit
                                      ? C
                                      : C extends "-" | "_" | "." | "*"
                                        ? C
                                        : EncodeUriEncodedChar<C>;

type EncodeQueryLiteral<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? EncodeQueryChar<C> extends infer E extends string
      ? string extends E
        ? string
        : EncodeQueryLiteral<Rest, `${Acc}${E}`>
      : string
    : Acc;

/**
 * Helper: refined return of `encodeQueryKey(input)` / `encodeQueryValue(input)`
 * for string inputs. `encodeQueryValue` also accepts non-string `QueryValue`s
 * (arrays, objects, numbers) which always widen to `string`.
 */
export type EncodeQueryResult<S extends string> = Refine<S, EncodeQueryLiteral<S>>;

/**
 * `encodeHost(name)` = `toASCII(name).replace(/[/?#@]/g, encoded)`.
 *
 * The vendored `toASCII` (see `src/punycode.ts`) returns ASCII labels
 * unchanged — it only kicks in for non-ASCII input (IDN punycode). So
 * pure ASCII (uppercase or lowercase) + digits + `-` + `.` are identity;
 * structural chars (`/?#@`) always encode to their fixed percent-triples.
 * We widen only for non-ASCII characters (`toASCII` would return an
 * `xn--…` label that TypeScript can't model at the type level).
 */
type EncodeHostChar<C extends string> = C extends LowerAlpha | UpperAlpha | Digit | "-" | "."
  ? C
  : C extends "/"
    ? "%2F"
    : C extends "?"
      ? "%3F"
      : C extends "#"
        ? "%23"
        : C extends "@"
          ? "%40"
          : string;

type EncodeHostLiteral<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? EncodeHostChar<C> extends infer E extends string
      ? string extends E
        ? string
        : EncodeHostLiteral<Rest, `${Acc}${E}`>
      : string
    : Acc;

/** Helper: refined return of `encodeHost(name)`. */
export type EncodeHostResult<S extends string> = Refine<S, EncodeHostLiteral<S>>;

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

/**
 * Recursively replace `%20` with a literal space; widen on any other `%` in
 * the remaining input. Used by {@link DecodeResult} and
 * {@link DecodeQueryResult}.
 */
type DecodePercent20<
  S extends string,
  Acc extends string = "",
> = S extends `${infer H}%20${infer R}`
  ? H extends `${string}%${string}`
    ? string
    : DecodePercent20<R, `${Acc}${H} `>
  : S extends `${string}%${string}`
    ? string
    : `${Acc}${S}`;

/**
 * `decode(text)` = `decodeURIComponent(text)`. Identity when the input has no
 * `%`; `%20` is decoded to a literal space; any other percent-triple widens
 * to `string` (a full ASCII/UTF-8 decode table is not modeled here).
 */
export type DecodeResult<S extends string> = Refine<S, DecodePercent20<S>>;

/**
 * Character scanner for `decodePath`:
 *
 *   `decodePath(text)` = `decode(text.replace(/%2F/gi, "%252F"))`.
 *
 * Two percent triples are modeled exactly:
 *
 *   - `%2F` / `%2f` — the `%2F` → `%252F` fold survives the subsequent
 *     `decodeURIComponent` (`%252F` → `%2F`), so the output preserves a
 *     canonicalized upper-case `%2F`.
 *   - `%20` — decoded to a literal space.
 *
 * Every other `%…` triple widens to `string` because the general ASCII/UTF-8
 * decode table (and the `%25…` case) is not modeled here. Non-`%` characters
 * pass through unchanged.
 */
type DecodePathScan<S extends string, Acc extends string = ""> = S extends ""
  ? Acc
  : S extends `%2F${infer R}`
    ? DecodePathScan<R, `${Acc}%2F`>
    : S extends `%2f${infer R}`
      ? DecodePathScan<R, `${Acc}%2F`>
      : S extends `%20${infer R}`
        ? DecodePathScan<R, `${Acc} `>
        : S extends `%${string}`
          ? string
          : S extends `${infer C}${infer R}`
            ? DecodePathScan<R, `${Acc}${C}`>
            : Acc;

/**
 * `decodePath(text)` = `decode(text.replace(/%2F/gi, "%252F"))`. Encoded
 * slashes (`%2F`/`%2f`) round-trip to `%2F`; `%20` decodes to a literal
 * space. Any other percent triple (including `%25…`) widens to `string`.
 */
export type DecodePathResult<S extends string> = Refine<S, DecodePathScan<S>>;

/** Per-char model of `decodeQueryKey` / `decodeQueryValue` when input has no `%`. */
type DecodeQueryPlusOnly<S extends string, Acc extends string = ""> = string extends S
  ? string
  : S extends `${infer C}${infer Rest}`
    ? C extends "+"
      ? DecodeQueryPlusOnly<Rest, `${Acc} `>
      : DecodeQueryPlusOnly<Rest, `${Acc}${C}`>
    : Acc;

/**
 * `decodeQueryKey(text)` / `decodeQueryValue(text)` =
 *   `decode(text.replace(/\+/g, " "))`.
 * We swap `+` for space per char and, additionally, handle `%20 → space` via
 * {@link DecodePercent20}. Any other percent-triple widens.
 */
export type DecodeQueryResult<S extends string> = Refine<
  S,
  DecodeQueryPlusOnly<S> extends infer Q extends string ? DecodePercent20<Q> : string
>;

// ---------------------------------------------------------------------------
// Base transforms — literal-preserving `withBase` / `withoutBase`
// ---------------------------------------------------------------------------

/** Prepend `/` if missing. */
type AddLeadingSlash<S extends string> = S extends `/${string}` ? S : `/${S}`;

/** Strip every leading `/`. */
type StripLeadingSlashes<S extends string> = S extends `/${infer R}` ? StripLeadingSlashes<R> : S;

/**
 * Type-level model of `withBase(input, base)` for the common case:
 *   • base = "" | "/" → identity (matches `isEmptyURL(base)` runtime).
 *   • input already at base boundary → identity.
 *   • otherwise → `${withoutTrailingSlash(base)}${leading-slash of input}`.
 *
 * Widens when input starts with `//` (open-redirect hardening path) or when
 * it contains a `:` that could be a scheme (`hasProtocol` runtime check is
 * regex-based and not modeled here).
 */
type WithBaseLiteral<Input extends string, Base extends string> = Input extends `//${string}`
  ? string
  : Input extends `${string}:${string}`
    ? string
    : Base extends "" | "/"
      ? Input
      : WithoutTrailingSlash<Base> extends infer BN extends string
        ? Input extends BN
          ? Input
          : Input extends `${BN}/${string}`
            ? Input
            : Input extends `${BN}?${string}`
              ? Input
              : Input extends `${BN}#${string}`
                ? Input
                : `${BN}${AddLeadingSlash<Input>}`
        : string;

/** Helper: refined return of `withBase(input, base)`. */
export type WithBaseResult<Input extends string, Base extends string> =
  IsStringLiteral<Input> extends true
    ? IsStringLiteral<Base> extends true
      ? WithBaseLiteral<Input, Base>
      : string
    : string;

/**
 * Type-level model of `withoutBase(input, base)`:
 *   • base = "" | "/" → identity.
 *   • input matches `${baseNorm}/${rest}` → `/${rest-with-leading-slashes-stripped}`.
 *   • otherwise → identity.
 */
type WithoutBaseLiteral<Input extends string, Base extends string> = Base extends "" | "/"
  ? Input
  : WithoutTrailingSlash<Base> extends infer BN extends string
    ? Input extends `${BN}`
      ? "/"
      : Input extends `${BN}/${infer Rest}`
        ? `/${StripLeadingSlashes<Rest>}`
        : Input extends `${BN}?${string}`
          ? `/${AfterBase<Input, BN>}`
          : Input extends `${BN}#${string}`
            ? `/${AfterBase<Input, BN>}`
            : Input
    : string;

/** Extract the suffix of `Input` after literal prefix `BN`. */
type AfterBase<Input extends string, BN extends string> = Input extends `${BN}${infer Rest}`
  ? StripLeadingSlashes<Rest>
  : Input;

/** Helper: refined return of `withoutBase(input, base)`. */
export type WithoutBaseResult<Input extends string, Base extends string> =
  IsStringLiteral<Input> extends true
    ? IsStringLiteral<Base> extends true
      ? WithoutBaseLiteral<Input, Base>
      : string
    : string;

// ---------------------------------------------------------------------------
// Host / port / auth transforms — literal-preserving models of `src/utils/host.ts`
// ---------------------------------------------------------------------------

/**
 * `true` when the input has no authority slot — i.e. it starts with `/`, `?`,
 * or `#` but is NOT protocol-relative (`//host`). These inputs are returned
 * unchanged by every host-related transform.
 */
type HasNoAuthoritySlot<S extends string> = S extends `//${string}`
  ? false
  : S extends `/${string}` | `?${string}` | `#${string}`
    ? true
    : false;

/** Split "scheme://rest" into `[Scheme, Rest]`, else `never`. */
type SplitScheme<S extends string> = S extends `${infer Scheme}://${infer Rest}`
  ? [Scheme, Rest]
  : never;

/** Split authority + path: first `/`, `?`, or `#` after the authority. */
type SplitAuthorityPath<S extends string> = S extends `${infer A}/${infer R}`
  ? [A, `/${R}`]
  : S extends `${infer A}?${infer R}`
    ? [A, `?${R}`]
    : S extends `${infer A}#${infer R}`
      ? [A, `#${R}`]
      : [S, ""];

/** Split "user:pass@host" → `[User, Host]`; no `@` → `["", authority]`. */
type SplitUserinfo<A extends string> = A extends `${infer U}@${infer H}` ? [U, H] : ["", A];

/**
 * Strip a trailing `:port` from a host literal. Handles bracketed IPv6
 * (`[::1]:8080` → `[::1]`) and simple `host:port`; returns the input
 * unchanged when no port is present or the tail is not a number literal.
 */
type StripPort<H extends string> = H extends `[${infer V6}]:${infer P}`
  ? P extends `${number}`
    ? `[${V6}]`
    : H
  : H extends `[${string}]`
    ? H
    : H extends `${infer Base}:${infer Rest}`
      ? Rest extends `${number}`
        ? Base
        : H
      : H;

type WithHostLiteral<Input extends string, NewHost extends string> =
  HasNoAuthoritySlot<Input> extends true
    ? Input
    : SplitScheme<Input> extends [infer Scheme extends string, infer Rest extends string]
      ? SplitAuthorityPath<Rest> extends [
          infer AuthHost extends string,
          infer PathTail extends string,
        ]
        ? SplitUserinfo<AuthHost> extends [infer U extends string, infer _Old extends string]
          ? U extends ""
            ? `${Scheme}://${NewHost}${PathTail}`
            : `${Scheme}://${U}@${NewHost}${PathTail}`
          : string
        : string
      : string;

/** Helper: refined return of `withHost(input, host)`. */
export type WithHostResult<Input extends string, NewHost extends string> =
  IsStringLiteral<Input> extends true
    ? IsStringLiteral<NewHost> extends true
      ? WithHostLiteral<Input, NewHost>
      : string
    : string;

/** `true` when `P` is a specific literal (not the broad `number` / `string`). */
type IsPortLiteral<P> = number extends P ? false : string extends P ? false : true;

/**
 * Recursive digit-only length scan: returns `Count` (as `unknown[]`) if `S`
 * is a pure sequence of ASCII digits, or `false` if any non-digit appears.
 */
type CountDigits<S extends string, Count extends readonly unknown[] = []> = S extends ""
  ? Count
  : S extends `${infer H}${infer R}`
    ? H extends Digit
      ? CountDigits<R, [...Count, unknown]>
      : false
    : false;

/**
 * Coarse type-level port validation. Runtime `validatePort` accepts only
 * an integer in `1..65535`; TypeScript can't cheaply express that range, so
 * we classify strictly-integer numeric literals by digit-length:
 *
 * - `"valid"` — 1..4 digit non-negative integer with no leading zero.
 * - `"invalid"` — leading zero, sign, decimal/scientific form, non-digit
 *   characters, or 6+ digits (>= 100000, well above 65535).
 * - `"unknown"` — 5-digit non-negative integer: `10000..65535` runtime accepts,
 *   `65536..99999` runtime rejects. TypeScript can't discriminate without
 *   full integer arithmetic, so callers widen to `string`.
 */
type IsProvablyValidPort<P extends string | number> = `${P}` extends `-${string}`
  ? "invalid"
  : `${P}` extends `0${string}`
    ? "invalid"
    : CountDigits<`${P}`> extends infer Digits extends readonly unknown[]
      ? Digits extends readonly [unknown, unknown, unknown, unknown, unknown, unknown, ...unknown[]]
        ? "invalid"
        : Digits extends readonly [unknown, unknown, unknown, unknown, unknown]
          ? "unknown"
          : Digits extends readonly [unknown, ...unknown[]]
            ? "valid"
            : "invalid"
      : "invalid";

/**
 * `withPort(input, port)` sets the port on an existing authority. Runtime
 * calls `validatePort(port)` FIRST — a `throw` happens for invalid ports
 * even when the input has no authority slot. Type rules:
 *
 * - Provably-invalid literal port → `never` (the call throws regardless of
 *   input shape).
 * - Broad `number` / `string` port or 5-digit port → `string` (runtime
 *   validity unknown).
 * - Relative input (no authority slot) with a provably-valid port → identity
 *   (`Input`), matches the runtime no-op after validation succeeds.
 * - Absolute input with a provably-valid port → refined literal template.
 */
type WithPortLiteral<Input extends string, Port extends string | number> =
  IsPortLiteral<Port> extends false
    ? string
    : IsProvablyValidPort<Port> extends "invalid"
      ? never
      : IsProvablyValidPort<Port> extends "unknown"
        ? string
        : HasNoAuthoritySlot<Input> extends true
          ? Input
          : SplitScheme<Input> extends [infer Scheme extends string, infer Rest extends string]
            ? SplitAuthorityPath<Rest> extends [
                infer AuthHost extends string,
                infer PathTail extends string,
              ]
              ? SplitUserinfo<AuthHost> extends [
                  infer U extends string,
                  infer HostAndPort extends string,
                ]
                ? StripPort<HostAndPort> extends infer Host extends string
                  ? U extends ""
                    ? `${Scheme}://${Host}:${Port}${PathTail}`
                    : `${Scheme}://${U}@${Host}:${Port}${PathTail}`
                  : string
                : string
              : string
            : string;

/** Helper: refined return of `withPort(input, port)`. */
export type WithPortResult<Input extends string, Port extends string | number> =
  IsStringLiteral<Input> extends true
    ? Port extends string | number
      ? WithPortLiteral<Input, Port>
      : string
    : string;

type WithoutPortLiteral<Input extends string> =
  HasNoAuthoritySlot<Input> extends true
    ? Input
    : SplitScheme<Input> extends [infer Scheme extends string, infer Rest extends string]
      ? SplitAuthorityPath<Rest> extends [
          infer AuthHost extends string,
          infer PathTail extends string,
        ]
        ? SplitUserinfo<AuthHost> extends [infer U extends string, infer HostAndPort extends string]
          ? StripPort<HostAndPort> extends infer Host extends string
            ? U extends ""
              ? `${Scheme}://${Host}${PathTail}`
              : `${Scheme}://${U}@${Host}${PathTail}`
            : string
          : string
        : string
      : string;

/** Helper: refined return of `withoutPort(input)`. */
export type WithoutPortResult<Input extends string> = Refine<Input, WithoutPortLiteral<Input>>;

type WithoutAuthLiteral<Input extends string> =
  HasNoAuthoritySlot<Input> extends true
    ? Input
    : SplitScheme<Input> extends [infer Scheme extends string, infer Rest extends string]
      ? SplitAuthorityPath<Rest> extends [
          infer AuthHost extends string,
          infer PathTail extends string,
        ]
        ? SplitUserinfo<AuthHost> extends [infer _U extends string, infer Host extends string]
          ? `${Scheme}://${Host}${PathTail}`
          : string
        : string
      : string;

/** Helper: refined return of `withoutAuth(input)`. */
export type WithoutAuthResult<Input extends string> = Refine<Input, WithoutAuthLiteral<Input>>;

// ---------------------------------------------------------------------------
// URL predicates — literal booleans
// ---------------------------------------------------------------------------

/** `isEmptyURL(url)` = `!url || url === "/"`. */
type IsEmptyURLLiteral<S extends string> = S extends "" | "/" ? true : false;

/** Helper: refined return of `isEmptyURL(url)`. */
export type IsEmptyURLResult<S extends string> = Refine<S, IsEmptyURLLiteral<S>, boolean>;

/** `isNonEmptyURL(url)` = `Boolean(url) && url !== "/"`. */
type IsNonEmptyURLLiteral<S extends string> = S extends "" | "/" ? false : true;

/** Helper: refined return of `isNonEmptyURL(url)`. */
export type IsNonEmptyURLResult<S extends string> = Refine<S, IsNonEmptyURLLiteral<S>, boolean>;

/**
 * `isSamePath(p1, p2)` returns `decode(withoutTrailingSlash(p1)) === decode(withoutTrailingSlash(p2))`.
 * When neither input contains `%`, `decode` is identity and the comparison
 * reduces to `withoutTrailingSlash(p1) === withoutTrailingSlash(p2)`.
 * Inputs with `%` widen to `boolean` (percent-decoding is not modeled).
 */
type IsSamePathLiteral<A extends string, B extends string> = A extends `${string}%${string}`
  ? boolean
  : B extends `${string}%${string}`
    ? boolean
    : WithoutTrailingSlash<A> extends WithoutTrailingSlash<B>
      ? WithoutTrailingSlash<B> extends WithoutTrailingSlash<A>
        ? true
        : false
      : false;

/** Helper: refined return of `isSamePath(p1, p2)`. */
export type IsSamePathResult<A extends string, B extends string> =
  IsStringLiteral<A> extends true
    ? IsStringLiteral<B> extends true
      ? IsSamePathLiteral<A, B>
      : boolean
    : boolean;

/**
 * `isEqual(a, b, options?)` normalizes both sides according to `options`.
 * We only refine when every option is a literal (`{ trailingSlash: true }`,
 * `{ trailingSlash: false }`, or absent); a broad `CompareURLOptions`
 * variable (any optional flag typed as `boolean`) widens to `boolean`.
 *
 *   • no options / all-absent → strip trailing slash, then compare.
 *   • `{ trailingSlash: true }` (literal) → compare directly, no normalization.
 *   • `{ trailingSlash: false }` (literal, default) → same as no options.
 *   • `{ encoding: true }` / `{ leadingSlash: true }` → widen (extra
 *     normalization not modeled).
 */
type IsBroadOptionFlag<F> = boolean extends F ? true : false;

type OptionsAreLiteral<O> = O extends undefined
  ? true
  : O extends { trailingSlash?: unknown; leadingSlash?: unknown; encoding?: unknown }
    ? ("trailingSlash" extends keyof O ? IsBroadOptionFlag<O["trailingSlash"]> : false) extends true
      ? false
      : ("leadingSlash" extends keyof O ? IsBroadOptionFlag<O["leadingSlash"]> : false) extends true
        ? false
        : ("encoding" extends keyof O ? IsBroadOptionFlag<O["encoding"]> : false) extends true
          ? false
          : true
    : false;

/**
 * Type-level mirror of runtime `isEqual`. Runtime normalization order:
 * 1. When `trailingSlash !== true`, strip trailing `/` on both.
 * 2. When `leadingSlash !== true` (default), prepend `/` on both.
 * 3. When `encoding === true`, decode both.
 * Then compare `lhs === rhs`.
 *
 * At the type level: `%` in either input widens to `boolean` (encode decisions
 * not modeled); broad options widen; otherwise apply the same slash
 * normalizations before extends-check.
 */
type IsEqualLiteral<A extends string, B extends string, Options> = A extends `${string}%${string}`
  ? boolean
  : B extends `${string}%${string}`
    ? boolean
    : OptionsAreLiteral<Options> extends false
      ? boolean
      : Options extends { encoding: true }
        ? boolean
        : NormalizeIsEqualPath<A, Options> extends infer NA extends string
          ? NormalizeIsEqualPath<B, Options> extends infer NB extends string
            ? NA extends NB
              ? NB extends NA
                ? true
                : false
              : false
            : boolean
          : boolean;

/**
 * Apply the runtime slash normalizations (trailing strip unless
 * `trailingSlash: true`; leading prepend unless `leadingSlash: true`) to a
 * literal path so the two arms of {@link IsEqualLiteral} can be compared
 * directly.
 */
type NormalizeIsEqualPath<S extends string, Options> = (
  Options extends { trailingSlash: true } ? S : WithoutTrailingSlash<S>
) extends infer Stripped extends string
  ? Options extends { leadingSlash: true }
    ? Stripped
    : Stripped extends `/${string}`
      ? Stripped
      : `/${Stripped}`
  : S;

/** Helper: refined return of `isEqual(a, b, options?)`. */
export type IsEqualResult<A extends string, B extends string, Options> =
  IsStringLiteral<A> extends true
    ? IsStringLiteral<B> extends true
      ? IsEqualLiteral<A, B, Options>
      : boolean
    : boolean;

// ---------------------------------------------------------------------------
// HasProtocol — literal boolean
// ---------------------------------------------------------------------------
/**
 * Common scheme prefixes we can prove `hasProtocol` returns `true` for
 * without simulating the full regex. Non-strict mode accepts every one of
 * these; strict mode still accepts everything except `data:`/`blob:`/
 * `javascript:` (which have no `//`), so those widen under `strict: true`.
 */
type CommonSchemePrefix = "http://" | "https://" | "ftp://" | "file://" | "ws://" | "wss://";

type OpaqueSchemePrefix = "data:" | "blob:" | "javascript:" | "vbscript:";

type HasProtocolLiteral<
  S extends string,
  AcceptRelative extends boolean,
  Strict extends boolean,
> = S extends `${CommonSchemePrefix}${string}`
  ? true
  : S extends `${OpaqueSchemePrefix}${string}`
    ? Strict extends true
      ? boolean
      : true
    : S extends `//${string}`
      ? AcceptRelative
      : boolean;

/** Helper: refined return of `hasProtocol(input, opts?)`. */
export type HasProtocolResult<
  S extends string,
  AcceptRelative extends boolean,
  Strict extends boolean,
> = IsStringLiteral<S> extends true ? HasProtocolLiteral<S, AcceptRelative, Strict> : boolean;

// ---------------------------------------------------------------------------
// Parse structs — literal-preserving `parseAuth` / `parseHost`
// ---------------------------------------------------------------------------

/**
 * `parseAuth(input)` splits on the first `:`. Refined when input has no `%`
 * (decode is identity) and no other special chars that could re-encode.
 */
export type ParseAuthResult<S extends string> =
  IsStringLiteral<S> extends true
    ? S extends `${string}%${string}`
      ? { username: string; password: string }
      : S extends `${infer User}:${infer Pass}`
        ? { password: Pass; username: User }
        : { password: ""; username: S }
    : { username: string; password: string };

/**
 * `parseHost(input)` splits into `{hostname, port}`. Refined for common
 * shapes: bare host, host:port, `[ipv6]`, `[ipv6]:port`. Widens for inputs
 * with `%` (decode transforms) or non-standard forms.
 */
export type ParseHostResult<S extends string> =
  IsStringLiteral<S> extends true
    ? S extends `${string}%${string}`
      ? { hostname: string; port: string | undefined }
      : S extends `[${infer V6}]:${infer P}`
        ? { hostname: `[${V6}]`; port: P extends "" ? undefined : P }
        : S extends `[${infer V6}]`
          ? { hostname: `[${V6}]`; port: undefined }
          : S extends `${infer Host}:${infer P}`
            ? P extends `${number}`
              ? { hostname: Host; port: P }
              : { hostname: S; port: undefined }
            : { hostname: S; port: undefined }
    : { hostname: string; port: string | undefined };

// ---------------------------------------------------------------------------
// StringifyParsedURL — literal composition
// ---------------------------------------------------------------------------

/**
 * Extract a string field for stringify composition. Requirements:
 *
 * - Absent (`K` not a key of `P`) → `""` (matches runtime default).
 * - Present as a concrete string literal → the literal.
 * - Present as broad `string` or `string | undefined` (optional field on
 *   `Partial<ParsedURL>`, etc.) → `string`, so the whole stringify result
 *   widens rather than pretending the runtime output is exact.
 * - Present as some other type → `""` (defensive).
 */
type StringField<P, K extends string> = K extends keyof P
  ? [P[K]] extends [string]
    ? string extends P[K]
      ? string
      : undefined extends P[K]
        ? string
        : P[K]
    : undefined extends P[K]
      ? string
      : ""
  : "";

type NormalizeSearch<S extends string> = S extends "" ? "" : S extends `?${string}` ? S : `?${S}`;

/**
 * `true` when a specific field on `P` is either absent, broad `string`, or
 * `string | undefined` — cases where the runtime output for that slot cannot
 * be modeled as a specific literal and the whole stringify result must widen.
 */
type IsBroadOrOptionalStringField<P, K extends string> = K extends keyof P
  ? [P[K]] extends [string]
    ? string extends P[K]
      ? true
      : undefined extends P[K]
        ? true
        : false
    : undefined extends P[K]
      ? true
      : false
  : false;

/**
 * `true` when any field the stringifier reads is broad `string` or optional
 * (`string | undefined`) — the runtime output can be any composition, so the
 * whole result MUST widen rather than pretend the shape is exact.
 */
type HasBroadStringifyField<P> = true extends
  | IsBroadOrOptionalStringField<P, "protocol">
  | IsBroadOrOptionalStringField<P, "host">
  | IsBroadOrOptionalStringField<P, "auth">
  | IsBroadOrOptionalStringField<P, "pathname">
  | IsBroadOrOptionalStringField<P, "search">
  | IsBroadOrOptionalStringField<P, "hash">
  ? true
  : false;

type StringifyParsedURLLiteral<
  P extends {
    protocol?: string;
    host?: string;
    auth?: string;
    pathname?: string;
    search?: string;
    hash?: string;
  },
> =
  StringField<P, "protocol"> extends infer Protocol extends string
    ? StringField<P, "host"> extends infer Host extends string
      ? StringField<P, "auth"> extends infer AuthRaw extends string
        ? StringField<P, "pathname"> extends infer Pathname extends string
          ? StringField<P, "search"> extends infer SearchRaw extends string
            ? StringField<P, "hash"> extends infer Hash extends string
              ? [Host, AuthRaw] extends ["", ""]
                ? Protocol extends ""
                  ? `${Pathname}${NormalizeSearch<SearchRaw>}${Hash}`
                  : `${Protocol}${Pathname}${NormalizeSearch<SearchRaw>}${Hash}`
                : Protocol extends ""
                  ? `${AuthRaw extends "" ? "" : `${AuthRaw}@`}${Host}${Pathname}${NormalizeSearch<SearchRaw>}${Hash}`
                  : `${Protocol}//${AuthRaw extends "" ? "" : `${AuthRaw}@`}${Host}${Pathname}${NormalizeSearch<SearchRaw>}${Hash}`
              : string
            : string
          : string
        : string
      : string
    : string;

/** Helper: refined return of `stringifyParsedURL(parsed)`. */
export type StringifyParsedURLResult<P> = P extends {
  protocol?: string;
  host?: string;
  auth?: string;
  pathname?: string;
  search?: string;
  hash?: string;
}
  ? HasBroadStringifyField<P> extends true
    ? string
    : StringifyParsedURLLiteral<P>
  : string;

// ---------------------------------------------------------------------------
// ParseQuery / getQuery — literal splitting
// ---------------------------------------------------------------------------

/**
 * `true` if `S` contains characters or shapes that our simple type-level
 * query parser can't faithfully model:
 *   • `%` / `+` (need decoding),
 *   • dangerous keys (`__proto__`, `constructor`, `prototype`) that the
 *     runtime silently drops,
 *   • `&&` (empty pair — runtime skips),
 *   • `=` at the very start of a pair (empty key — widen for simplicity).
 */
type HasUnsafeQueryChars<S extends string> = S extends
  | `${string}%${string}`
  | `${string}+${string}`
  | `${string}__proto__${string}`
  | `${string}constructor${string}`
  | `${string}prototype${string}`
  | `${string}&&${string}`
  | `=${string}`
  | `${string}&=${string}`
  ? true
  : false;

/** Extract the key of a pair (`k=v` → `k`, no `=` → whole string). */
type PairKey<S extends string> = S extends `${infer K}=${string}` ? K : S;

/** `true` if any pair key repeats in the `&`-separated list. */
type HasDuplicateKey<
  S extends string,
  Seen extends string = never,
> = S extends `${infer Pair}&${infer Rest}`
  ? PairKey<Pair> extends infer K extends string
    ? K extends Seen
      ? true
      : HasDuplicateKey<Rest, Seen | K>
    : false
  : PairKey<S> extends infer K2 extends string
    ? K2 extends Seen
      ? true
      : false
    : false;

type ParseQueryPair<S extends string> = S extends `${infer K}=${infer V}`
  ? V extends `${string}=${string}`
    ? Record<K, `${V}`>
    : Record<K, V>
  : Record<S, "">;

type ParseQueryLiteralInner<S extends string, Acc> = S extends ""
  ? Acc
  : S extends `${infer Pair}&${infer Rest}`
    ? ParseQueryLiteralInner<Rest, Acc & ParseQueryPair<Pair>>
    : Acc & ParseQueryPair<S>;

/**
 * Refined struct for `parseQuery(input)`. Widens to a broad
 * `Record<string, string | string[]>` (the runtime `ParsedQuery` shape,
 * which supports repeated-key arrays) when the input contains any of the
 * unsafe shapes ({@link HasUnsafeQueryChars}) or has duplicate keys.
 */
/**
 * Collapse an intersection into a flat object shape so `toEqualTypeOf` and
 * hover tools display `{ a: "1"; b: "2" }` instead of `{ a: "1" } & { b: "2" }`.
 */
// oxlint-disable-next-line typescript/ban-types,typescript/no-empty-object-type -- intentional `& {}` to collapse intersections at hover time
type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type ParseQueryResult<S extends string> =
  IsStringLiteral<S> extends true
    ? (S extends `?${infer Body}` ? Body : S) extends infer Q extends string
      ? Q extends ""
        ? Record<string, never>
        : HasUnsafeQueryChars<Q> extends true
          ? Record<string, string | string[]>
          : HasDuplicateKey<Q> extends true
            ? Record<string, string | string[]>
            : Prettify<ParseQueryLiteralInner<Q, Record<never, string>>>
      : Record<string, string | string[]>
    : Record<string, string | string[]>;

/**
 * Extract the search-string body from a URL literal (`?` prefix stripped;
 * fragment removed) so it can be fed to {@link ParseQueryResult}.
 */
type ExtractSearchBody<S extends string> = S extends `${string}?${infer Rest}`
  ? Rest extends `${infer Q}#${string}`
    ? Q
    : Rest
  : "";

/** Helper: refined return of `getQuery(input)`. */
export type GetQueryResult<S extends string> =
  IsStringLiteral<S> extends true
    ? ParseQueryResult<ExtractSearchBody<S>>
    : Record<string, string | string[]>;
