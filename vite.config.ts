import { defineConfig } from "vite-plus";
export default defineConfig({
  fmt: {
    printWidth: 100,
  },
  pack: {
    format: ["esm"],
    platform: "neutral",
    target: "esnext",
    attw: { profile: "esm-only", level: "error" },
    publint: { strict: true },
    failOnWarn: "ci-only",
    exports: true,
  },
  test: {
    typecheck: { enabled: true },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/_types.ts", "src/punycode.ts", "src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
        "src/parse.ts": {
          lines: 98,
          functions: 100,
          branches: 86,
          statements: 98,
        },
        "src/utils/fragment.ts": {
          lines: 83,
          functions: 75,
          branches: 88,
          statements: 83,
        },
        "src/utils/host.ts": {
          lines: 94,
          functions: 100,
          branches: 89,
          statements: 94,
        },
        "src/utils/join.ts": {
          lines: 100,
          functions: 100,
          branches: 97,
          statements: 100,
        },
        "src/utils/normalize.ts": {
          lines: 93,
          functions: 100,
          branches: 80,
          statements: 93,
        },
        "src/utils/path-parameters.ts": {
          lines: 88,
          functions: 100,
          branches: 88,
          statements: 88,
        },
        "src/utils/protocol.ts": {
          lines: 96,
          functions: 100,
          branches: 95,
          statements: 96,
        },
        "src/utils/slash.ts": {
          lines: 100,
          functions: 100,
          branches: 95,
          statements: 100,
        },
      },
    },
  },
  staged: {
    "*.{ts,mts}": "vp check --fix",
    "*.{json,yml,yaml,md}": "vp fmt --write",
    "package.json": "node --experimental-strip-types scripts/check-no-runtime-deps.ts",
  },
  run: {
    tasks: {
      "check:no-deps": {
        command: "node --experimental-strip-types scripts/check-no-runtime-deps.ts",
        input: ["package.json", "scripts/check-no-runtime-deps.ts"],
        output: [],
      },
      lint: { command: "vp lint" },
      check: { command: "vp check" },
      typecheck: { command: "tsc --noEmit" },
      test: {
        command: "vp test run --typecheck",
        dependsOn: ["check:no-deps", "check"],
        output: [{ auto: true }, "!coverage/**"],
      },
      build: {
        command: "vp pack",
        dependsOn: ["check"],
        env: ["CI"],
      },
      dev: { command: "vp test", cache: false },
      format: { command: "vp fmt --write" },
      "lint:fix": { command: "vp lint --fix" },
      "test:coverage": { command: "vp test run --coverage" },
      "autofix:automd": { command: "pnpm exec automd" },
      "autofix:check": {
        command: "vp check --fix",
        dependsOn: ["autofix:automd"],
      },
      autofix: {
        command: "vp fmt --write",
        dependsOn: ["autofix:check"],
      },
    },
  },
  lint: {
    plugins: ["oxc", "typescript", "unicorn", "import", "node", "promise", "vitest"],
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
      style: "error",
      pedantic: "error",
      restriction: "error",
      nursery: "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    env: {
      builtin: true,
      es2026: true,
      node: true,
    },
    ignorePatterns: ["src/punycode.ts"],
    rules: {
      "no-control-regex": "off",
      // ---------------------------------------------------------------
      // Rules disabled after enabling all oxlint categories.
      // Every entry below is a deliberate exemption; nothing here masks
      // a real bug in the URL parser.
      // ---------------------------------------------------------------

      // Restriction: nonsensical for a library that intentionally exports many
      // named symbols from src/index.ts and has no default export.
      "import/no-named-export": "off",
      "import/group-exports": "off",
      "import/exports-last": "off",
      "eslint/no-duplicate-imports": "off", // doesn't understand `import type` vs `import` separation
      "import/no-relative-parent-imports": "off",


      // Restriction: opinionated style rules that fight readable code.
      "eslint/id-length": "off", // t, c, s, i, k are fine in tight scopes
      "eslint/no-magic-numbers": "off", // URL parser deals in char codes, ports, etc.
      "eslint/no-undefined": "off", // undefined is a valid value in TS
      "eslint/no-ternary": "off",
      "eslint/func-style": "off",
      "eslint/no-script-url": "off", // this IS a URL parser; javascript: is a test input
      "eslint/sort-imports": "off",
      "eslint/no-continue": "off",
      "eslint/max-statements": "off",
      "eslint/max-lines-per-function": "off",
      "eslint/max-lines": "off",

      // Restriction: legit modern JS/TS features.
      "oxc/no-optional-chaining": "off",
      "oxc/no-rest-spread-properties": "off",

      // Unicorn: null is a legitimate WHATWG-URL value (host/port/etc.).
      "unicorn/no-null": "off",

      // TypeScript restriction rules that don't match this codebase.
      // no-deprecated: hits our own `$URL` back-compat class re-exports.
      "typescript/no-deprecated": "off",
      // prefer-readonly-parameter-types: forcing Readonly<> on every public
      // API parameter would rewrite the entire type surface; the parser never
      // mutates inputs, so this is noise for a value-in / value-out library.
      "typescript/prefer-readonly-parameter-types": "off",

      // Vitest restriction rules that don't match this suite's conventions.
      "vitest/prefer-expect-assertions": "off",
      "vitest/require-test-timeout": "off",
      "vitest/prefer-describe-function-title": "off",
      "vitest/prefer-to-be-truthy": "off", // we use toBe(true)
      "vitest/prefer-to-be-falsy": "off", // we use toBe(false)
      "vitest/prefer-importing-vitest-globals": "off", // globals: true in test config
    },
    overrides: [
      {
        files: ["tests/**/*.ts"],
        rules: {
          // Test-data literals are inherently readonly-in-spirit; forcing
          // `readonly` annotations on every test fn parameter is noise.
          "typescript/prefer-readonly-parameter-types": "off",
        },
      },
      {
        files: ["**/*.test-d.ts"],
        rules: {
          // expectTypeOf(...).toEqualTypeOf<...>() is idiomatic and returns void.
          "typescript/no-confusing-void-expression": "off",
        },
      },
      {
        files: ["tests/wpt-urltestdata.test.ts"],
        rules: {
          "vitest/no-disabled-tests": "off",
          "vitest/no-conditional-tests": "off",
          "vitest/no-standalone-expect": "off",
          "vitest/warn-todo": "off", // .todo tracks known WHATWG divergences
          "vitest/prefer-each": "off", // conditional it.fails/it.todo per case
        },
      },
      {
        files: ["scripts/**/*.ts"],
        rules: {
          "no-console": "off",
          "import/no-nodejs-modules": "off", // Node scripts, obviously
          "unicorn/no-process-exit": "off",
          "vitest/require-hook": "off", // not a test file
        },
      },
    ],
  },
});
