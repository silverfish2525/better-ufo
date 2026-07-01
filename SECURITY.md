# Security Policy

## ⚠️ Reporting a Vulnerability

To report a security vulnerability in `better-ufo`:

1. **GitHub Private Security Advisory** (preferred):
   <https://github.com/silverfish2525/better-ufo/security/advisories/new>
2. **Upstream fallback:** if the same bug also affects `unjs/ufo`,
   please **also** send a heads-up to
   [security+ufo@unjs.io](mailto:security+ufo@unjs.io) or submit via
   [Huntr](https://huntr.dev/bounties/disclose/?target=https://github.com/unjs/ufo).

We aim to acknowledge reports within 72 hours and to ship a fix or
mitigation within 2 weeks for confirmed vulnerabilities. Coordinated
disclosure with upstream is preferred where a fix is portable.

### Scope

In-scope vulnerability classes for `better-ufo`:

- Open-redirect surfaces (`joinURL`, `withBase`, `resolveURL`,
  `normalizeURL`) where an attacker-controlled input can be coaxed into
  producing a URL pointing to a different origin than the caller
  intended.
- Prototype-pollution in `parseQuery` / `getQuery` (extending
  `Object.prototype`, `Function.prototype`, etc.).
- Script-protocol / `javascript:` / `data:` / `vbscript:` bypasses of
  `isScriptProtocol`.
- Credential-leak in `parseAuth` where `user:pass@` slots are exposed
  in ways that violate WHATWG URL invariants.
- Encoding gaps where percent-encoded output diverges from
  `URLSearchParams.toString()` in ways that enable smuggling.

### Out of scope

- Behavioural differences vs. `unjs/ufo` that are documented as
  intentional in [`CREDITS.md`](./CREDITS.md) (breaking changes
  section) — those are the fork's mission, not bugs.
- Test-only files under `tests/fixture/` (WPT `urltestdata.json`,
  `toascii.json` are copied verbatim from the WHATWG test suite).

## Supply chain

Regularly upgrade to the latest published version and keep your
lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) checked
in so downstream reproducible builds are possible.

`better-ufo` has **zero runtime dependencies** (enforced by CI).
The only third-party byte in the shipped bundle is the vendored
punycode implementation (`src/punycode.ts`) — a copy of the public
punycode.js under the MIT license, retained for zero-cost IDN support.
