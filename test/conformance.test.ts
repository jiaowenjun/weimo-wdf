import { describe, expect, it } from "vitest";
import { fromMarkdown, toMarkdown } from "../src/adapters/markdown/index.js";
import {
  fromApple,
  fromTiptap,
  renderPlain,
  toApple,
  toTiptap,
  validateAndCanonicalize,
} from "../src/index.js";
import { fixtureCases, readFixtureJson, readFixtureText } from "./helpers.js";

describe("core fixtures (shared conformance corpus)", () => {
  for (const name of fixtureCases("core")) {
    it(`round-trips ${name} across all formats`, () => {
      const expected = validateAndCanonicalize(
        readFixtureJson("core", name, "expected.wdf.json"),
      );
      expect(expected.ok).toBe(true);
      if (!expected.ok) return;
      const doc = expected.value;

      // Markdown: golden output and lossless round trip.
      expect(toMarkdown(doc)).toBe(readFixtureText("core", name, "expected.md"));
      const markdown = toMarkdown(doc);
      const reparsed = fromMarkdown(markdown);
      expect(reparsed).toEqual({ ok: true, value: doc });

      // Markdown input parses to the same canonical document.
      expect(fromMarkdown(readFixtureText("core", name, "input.md"))).toEqual({
        ok: true,
        value: doc,
      });

      // Tiptap: golden input and lossless round trip.
      expect(fromTiptap(readFixtureJson("core", name, "input.pm.json"))).toEqual({
        ok: true,
        value: doc,
      });
      expect(fromTiptap(toTiptap(doc))).toEqual({ ok: true, value: doc });

      // Plain rendering matches the CLI golden output.
      expect(renderPlain(doc)).toBe(readFixtureText("core", name, "expected.cli.txt"));
    });
  }
});

describe("apple wire round trip", () => {
  it("round-trips the mixed-document fixture", () => {
    const expected = validateAndCanonicalize(
      readFixtureJson("core", "mixed-document", "expected.wdf.json"),
    );
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    const apple = toApple(expected.value);
    expect(apple.type).toBe("apple.document");
    expect(fromApple(apple)).toEqual({ ok: true, value: expected.value });
  });
});

describe("tight list items with inline marks", () => {
  it("round-trips exactly", () => {
    const markdown = "# Notes\n\n- **bold** item\n- a **b** c\n\n3. **b** start\n";
    const result = fromMarkdown(markdown);
    expect(result.ok).toBe(true);
    if (result.ok) expect(toMarkdown(result.value)).toBe(markdown);
  });

  it("rejects nested lists", () => {
    const result = fromMarkdown("- outer\n  - nested\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code.startsWith("markdown.unsupported"))).toBe(
        true,
      );
    }
  });
});

describe("canonicalization", () => {
  it("normalizes newlines and ordered start", () => {
    const result = validateAndCanonicalize({
      schema: "weimo.document",
      version: 1,
      root: {
        type: "doc",
        content: [
          {
            type: "ordered_list",
            content: [
              {
                type: "list_item",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "a\r\nb" }] },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(toMarkdown(result.value)).toBe("1. a\nb\n");
    expect(result.value.root.content[0]).toEqual({
      type: "ordered_list",
      attrs: { start: 1 },
      content: [
        {
          type: "list_item",
          content: [{ type: "paragraph", content: [{ type: "text", text: "a\nb" }] }],
        },
      ],
    });
  });
});
