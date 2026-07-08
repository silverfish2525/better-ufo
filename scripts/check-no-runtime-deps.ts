import pkg from "../package.json" with { type: "json" };
import process from "node:process";

const pkgRecord = pkg as Record<string, unknown>;
const rawDeps = pkgRecord["dependencies"];
const deps =
  rawDeps !== null && rawDeps !== undefined && typeof rawDeps === "object"
    ? Object.keys(rawDeps)
    : [];
if (deps.length > 0) {
  console.error("better-ufo must have zero runtime dependencies. Found:", deps.join(", "));
  process.exit(1);
}
console.log("OK: zero runtime dependencies");
