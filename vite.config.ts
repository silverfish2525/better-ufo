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
      "no-underscore-dangle": "off",
      "typescript/no-explicit-any": "error",
      "typescript/no-non-null-assertion": "error",
      "typescript/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      "typescript/no-import-type-side-effects": "error",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/error-message": "error",
      "unicorn/prefer-module": "error",
      "unicorn/prefer-export-from": "error",
      "unicorn/prefer-top-level-await": "error",
      "import/first": "error",
      "import/no-duplicates": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
    },
    overrides: [
      {
        files: ["tests/wpt-urltestdata.test.ts"],
        rules: {
          "vitest/no-disabled-tests": "off",
          "vitest/no-conditional-tests": "off",
          "vitest/no-standalone-expect": "off",
        },
      },
      {
        files: ["scripts/**/*.ts"],
        rules: {
          "no-console": "off",
        },
      },
    ],
  },
});
