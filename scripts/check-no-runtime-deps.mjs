// Guards ufo's zero-runtime-dependency invariant.
// See advisor-plans/012-deps-ci-dx-hygiene.md (Stage 4) for rationale.
import pkg from "../package.json" with { type: "json" };

const deps = Object.keys(pkg.dependencies || {});
if (deps.length > 0) {
  console.error(
    "ufo must have zero runtime dependencies. Found:",
    deps.join(", "),
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}
console.log("OK: zero runtime dependencies");
