import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 100,
  },
  lint: {
    categories: {
      correctness: "error",
      nursery: "error",
      pedantic: "error",
      perf: "error",
      restriction: "error",
      style: "error",
      suspicious: "error",
    },
    env: {
      builtin: true,
      es2026: true,
      node: true,
    },
    ignorePatterns: ["src/punycode.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["**/*.test-d.ts"],
        rules: {
          "typescript/no-confusing-void-expression": "off",
        },
      },
      {
        files: ["tests/wpt-urltestdata.test.ts"],
        rules: {
          "vitest/no-conditional-tests": "off",
          "vitest/no-disabled-tests": "off",
          "vitest/no-standalone-expect": "off",
          "vitest/warn-todo": "off",
        },
      },
      {
        files: ["scripts/**/*.ts"],
        rules: {
          "import/no-nodejs-modules": "off",
          "no-console": "off",
          "unicorn/no-process-exit": "off",
          "vitest/require-hook": "off",
        },
      },
    ],
    plugins: ["oxc", "typescript", "unicorn", "import", "node", "promise", "vitest"],
    rules: {
      "eslint/func-style": "off",
      "eslint/id-length": "off",
      "eslint/max-lines": "off",
      "eslint/max-lines-per-function": "off",
      "eslint/max-statements": "off",
      "eslint/no-continue": "off",
      "eslint/no-duplicate-imports": [
        "error",
        {
          allowSeparateTypeImports: true,
        },
      ],
      "eslint/no-magic-numbers": "off",
      "eslint/no-script-url": "off",
      "eslint/no-ternary": "off",
      "eslint/no-undefined": "off",
      "eslint/sort-imports": [
        "error",
        {
          allowSeparatedGroups: true,
          ignoreDeclarationSort: true,
        },
      ],
      "import/exports-last": "off",
      "import/group-exports": "off",
      "import/no-cycle": [
        "error",
        {
          ignoreExternal: true,
          ignoreTypes: false,
        },
      ],
      "import/no-default-export": "off",
      "import/no-named-export": "off",
      "import/no-relative-parent-imports": "off",
      "no-control-regex": "off",
      "oxc/no-optional-chaining": "off",
      "oxc/no-rest-spread-properties": "off",
      "typescript/no-deprecated": "off",
      "typescript/prefer-readonly-parameter-types": "off",
      "unicorn/no-null": "off",
      "vitest/prefer-describe-function-title": "off",
      "vitest/prefer-each": "off",
      "vitest/prefer-expect-assertions": "off",
      "vitest/prefer-importing-vitest-globals": "off",
      "vitest/prefer-to-be-falsy": "off",
      "vitest/prefer-to-be-truthy": "off",
      "vitest/require-test-timeout": "off",
    },
  },
  pack: {
    attw: { level: "error", profile: "esm-only" },
    exports: true,
    failOnWarn: "ci-only",
    platform: "neutral",
    publint: { strict: true },
    target: "esnext",
  },
  run: {
    tasks: {
      autofix: {
        command: "vp fmt --write",
        dependsOn: ["autofix:check"],
      },
      "autofix:automd": { command: "pnpm exec automd" },
      "autofix:check": {
        command: "vp check --fix",
        dependsOn: ["autofix:automd"],
      },
      build: {
        command: "vp pack",
        dependsOn: ["check"],
        env: ["CI"],
      },
      check: { command: "vp check" },
      "check:no-deps": {
        command: "node --experimental-strip-types scripts/check-no-runtime-deps.ts",
        input: ["package.json", "scripts/check-no-runtime-deps.ts"],
        output: [],
      },
      dev: { cache: false, command: "vp test" },
      format: { command: "vp fmt --write" },
      knip: {
        command:
          "knip --cache --treat-config-hints-as-errors --reporter symbols --reporter github-actions",
        input: [
          "src/**",
          "tests/**",
          "scripts/**",
          "knip.json",
          "package.json",
          "vite.config.ts",
          "pnpm-workspace.yaml",
        ],
        output: [],
      },
      "knip:production": {
        command:
          "knip --strict --cache --treat-config-hints-as-errors --reporter symbols --reporter github-actions",
        input: [
          "src/**",
          "scripts/**",
          "knip.json",
          "package.json",
          "vite.config.ts",
          "pnpm-workspace.yaml",
        ],
        output: [],
      },
      knipf: { cache: false, command: "knip --fix --allow-remove-files --no-exit-code" },
      lint: { command: "vp lint" },
      lintf: { command: "vp lint --fix" },
      test: {
        command: "vp test run --typecheck",
        dependsOn: ["check:no-deps", "check", "knip", "knip:production"],
        output: [{ auto: true }, "!coverage/**"],
      },
      "test:coverage": { command: "vp test run --coverage" },
      typecheck: { command: "tsc --noEmit" },
    },
  },
  staged: {
    "*.{json,yml,yaml,md}": "vp fmt --write",
    "*.{ts,mts}": "vp check --fix",
    "package.json": "node --experimental-strip-types scripts/check-no-runtime-deps.ts",
  },
  test: {
    coverage: {
      exclude: ["src/_types.ts", "src/punycode.ts", "src/index.ts"],
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        branches: 95,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
    typecheck: { enabled: true },
  },
});
