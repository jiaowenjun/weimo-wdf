import { describe, expect, it } from "vitest";
import { validateAndCanonicalize } from "../src/index.js";
import { fixtureCases, readFixtureJson } from "./helpers.js";

describe("canonicalization fixtures (shared conformance corpus)", () => {
  for (const name of fixtureCases("canonicalization")) {
    it(`canonicalizes ${name}`, () => {
      const result = validateAndCanonicalize(
        readFixtureJson("canonicalization", name, "case.json"),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(readFixtureJson("canonicalization", name, "expected.wdf.json"));
    });
  }
});
