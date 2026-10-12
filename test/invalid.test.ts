import { describe, expect, it } from "vitest";
import { fromTiptap, validateAndCanonicalize } from "../src/index.js";
import type { Diagnostic } from "../src/index.js";
import { fixtureCases, readFixtureJson } from "./helpers.js";

/** Each expected {code, path} must appear in the actual diagnostics. */
function expectDiagnostics(
  actual: Diagnostic[],
  expected: { code: string; path?: (string | number)[] }[],
): void {
  for (const wanted of expected) {
    const path = wanted.path ?? [];
    const match = actual.some(
      (diagnostic) => diagnostic.code === wanted.code && diagnostic.path.length === path.length &&
        diagnostic.path.every((segment, index) => segment === path[index]),
    );
    if (!match) {
      throw new Error(
        `expected diagnostic ${JSON.stringify(wanted)}; got ${JSON.stringify(actual)}`,
      );
    }
  }
}

describe("invalid fixtures (shared conformance corpus)", () => {
  for (const name of fixtureCases("invalid")) {
    it(`rejects ${name}`, () => {
      const result = validateAndCanonicalize(readFixtureJson("invalid", name, "case.json"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const expected = readFixtureJson("invalid", name, "diagnostics.json") as {
        code: string;
        path?: (string | number)[];
      }[];
      expectDiagnostics(result.diagnostics, expected);
    });
  }
});

describe("unknown mark is rejected (README example)", () => {
  it("reports wdf.unsupported_mark", () => {
    const result = validateAndCanonicalize({
      schema: "weimo.document",
      version: 1,
      root: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hi", marks: [{ type: "italic" }] }],
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((d) => d.code === "wdf.unsupported_mark")).toBe(true);
  });
});

describe("unknown property is rejected", () => {
  it("reports wdf.unknown_property with a path", () => {
    const result = validateAndCanonicalize({
      schema: "weimo.document",
      version: 1,
      root: {
        type: "doc",
        content: [{ type: "paragraph", content: [], extra: true }],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const diagnostic = result.diagnostics.find((d) => d.code === "wdf.unknown_property");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.path).toEqual(["root", "content", 0, "extra"]);
  });
});

describe("tiptap mark is rejected", () => {
  it("reports prosemirror.unsupported_mark", () => {
    const result = fromTiptap({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [{ type: "italic" }] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((d) => d.code === "prosemirror.unsupported_mark")).toBe(
      true,
    );
  });
});
