import { describe, expect, it } from "vitest";
import { toASCII } from "../src/punycode";
import toAsciiTests from "./fixture/toascii.json";

const ignoredTests = new Set(["a­b", "a%C2%ADb"]);

describe("punycode (toASCII)", () => {
  const tests = toAsciiTests
    .splice(1)
    .filter((t): t is Extract<typeof t, { input: string; output: string }> => typeof t === "object" && t !== null && typeof t.output === "string" && typeof t.input === "string" && !ignoredTests.has(t.input));

  for (const t of tests) {
    it(t.input + ((t.comment !== undefined && t.comment !== "") ? `: ${t.comment}` : ""), () => {
      expect(toASCII(t.input)).toBe(t.output);
    });
  }
});
