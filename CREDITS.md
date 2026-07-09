# Credits

`better-ufo` is a fork of [`unjs/ufo`](https://github.com/unjs/ufo)
by Pooya Parsa (@pi0) and the unjs contributors. See
[LICENSE](./LICENSE) for the upstream MIT copyright — this fork
inherits and preserves it.

## Adopted upstream work

The following upstream pull requests and issues from `unjs/ufo` were
incorporated into this fork, sometimes verbatim, sometimes reworked
to converge conflicting proposals against the WHATWG URL spec.
Every entry below has a matching cite in the source tree.

### Performance

- **@saripovdenis** —
  PR [#331](https://github.com/unjs/ufo/pull/331) (`parseQuery`
  charCode-scan rewrite, ~40% faster on real-world benchmarks),
  PR [#333](https://github.com/unjs/ufo/pull/333) (`stringifyQuery`
  single-pass string builder).
  Cite: `src/query.ts` (`parseQuery`, `stringifyQuery`).

### Security

- **@pi0** — PR [#289](https://github.com/unjs/ufo/pull/289)
  (`__proto__` / `constructor` guard for `getQuery` / `parseQuery`).
  Cite: `src/query.ts` (dangerous-key filter).
- **@spokodev** — PR [#355](https://github.com/unjs/ufo/pull/355)
  (empty-key `parseQuery` correctness fix — `=value` now round-trips
  as `{ "": "value" }` instead of silently losing the value).
  Cite: `src/query.ts` (empty-key branch).

### Encoding — WHATWG `application/x-www-form-urlencoded` compliance

Eleven overlapping community PRs proposed fixes to `encodeQueryValue`
/ `encodeQueryKey`. `better-ufo` converged them into a single
spec-aligned implementation (encode set drawn from
[WHATWG URL §5](https://url.spec.whatwg.org/#percent-encoded-bytes)).
Cite: `src/encoding.ts` (`RAW_QUERY_ENCODE_MAP` and query encode helpers).

- **@JvanderHeide** — PR [#279](https://github.com/unjs/ufo/pull/279) (pipe)
- **@yyz945947732** — PR [#288](https://github.com/unjs/ufo/pull/288) (semicolon)
- **@byt3m4st3r** — PR [#303](https://github.com/unjs/ufo/pull/303) (backtick)
- **@nianqingrenganmane** — PR [#305](https://github.com/unjs/ufo/pull/305)
  (`^`, backtick, `|`)
- **@ConnorBerghoffer** — PR [#310](https://github.com/unjs/ufo/pull/310) (backtick)
- **@terminalchai** — PRs [#318](https://github.com/unjs/ufo/pull/318) (`?`)
  and [#327](https://github.com/unjs/ufo/pull/327) (`^` + backtick)
- **@guoyangzhen** — PR [#324](https://github.com/unjs/ufo/pull/324) (caret + backtick)
- **@mvtandas** — PR [#328](https://github.com/unjs/ufo/pull/328) (backtick keep-encoded)
- **@armorbreak001** — PR [#329](https://github.com/unjs/ufo/pull/329)
  (backtick per RFC 1738)
- **@LeSingh1** — PR [#354](https://github.com/unjs/ufo/pull/354)
  (`^`, backtick, `?`)

### Bug fixes

- **@sandros94** — issue [#237](https://github.com/unjs/ufo/issues/237)
  (approach for `withProtocol` on `hostname:port` inputs — the fork
  distinguishes bare `localhost:9000` from opaque `mailto:foo@bar`
  and preserves the host slot).
  Cite: `src/utils/protocol.ts`.

### Features

- **@Thy3634** — issue [#243](https://github.com/unjs/ufo/issues/243)
  (proposal for `withPathParameters`).
  Cite: `src/utils/path-parameters.ts`.

---

If your work is listed here and you'd prefer different attribution
(name change, removal, additional link), please open an issue on this
fork.
