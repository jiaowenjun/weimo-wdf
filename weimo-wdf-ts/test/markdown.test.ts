import { describe, expect, it } from "vitest";
import { fromMarkdown, toMarkdown } from "../src/adapters/markdown/index.js";
import { WdfText, listItem, paragraph, type WdfDocument } from "../src/index.js";

describe("markdown parsing edges", () => {
  it("accepts setext headings", () => {
    const result = fromMarkdown("Title\n=====\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.root.content[0]).toEqual({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Title" }],
    });
  });

  it("keeps soft breaks as newline runs in one paragraph", () => {
    const result = fromMarkdown("a\nb\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.root.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "a\nb" }],
    });
  });

  it("keeps hard breaks as newline runs in one paragraph", () => {
    const result = fromMarkdown("a\\\nb\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.root.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "a\nb" }],
    });
  });

  it("splits blockquote lines into one paragraph per line", () => {
    const result = fromMarkdown("> a\n> b\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.root.content[0]).toEqual({
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    });
  });

  it("treats loose and tight lists as the same document", () => {
    const tight = fromMarkdown("- a\n- b\n");
    const loose = fromMarkdown("- a\n\n- b\n");
    expect(tight).toEqual(loose);
  });

  it("accepts an empty list item", () => {
    const result = fromMarkdown("-\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected: WdfDocument = {
      schema: "weimo.document",
      version: 1,
      root: {
        type: "doc",
        content: [{ type: "bullet_list", content: [listItem([])] }],
      },
    };
    expect(result.value).toEqual(expected);
    expect(fromMarkdown(toMarkdown(result.value))).toEqual({ ok: true, value: expected });
  });

  it("rejects markdown outside the subset", () => {
    const cases: [string, string][] = [
      ["*em*", "markdown.unsupported_inline"],
      ["`code`", "markdown.unsupported_code"],
      ["```\nfence\n```", "markdown.unsupported_block"],
      ["[link](https://x)", "markdown.unsupported_inline"],
      ["![img](x.png)", "markdown.unsupported_inline"],
      ["---", "markdown.unsupported_block"],
      ["<div>x</div>", "markdown.unsupported_block"],
    ];
    for (const [input, code] of cases) {
      const result = fromMarkdown(input);
      expect(result.ok, input).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics.some((d) => d.code === code), input).toBe(true);
      }
    }
  });

  it("rejects nested blockquotes inside quotes", () => {
    const result = fromMarkdown("> a\n>\n> > b\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === "markdown.unsupported_blockquote child")).toBe(
        true,
      );
    }
  });

  it("rejects ordered lists starting at 0", () => {
    const result = fromMarkdown("0. a\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === "wdf.invalid_list_start")).toBe(true);
    }
  });

  it("rejects an empty document", () => {
    const result = fromMarkdown("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === "wdf.empty_document")).toBe(true);
    }
  });

  it("normalizes CRLF newlines", () => {
    const result = fromMarkdown("# A\r\n\r\ntext\r\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.root.content).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "A" }] },
      { type: "paragraph", content: [{ type: "text", text: "text" }] },
    ]);
  });
});

describe("markdown serialization edges", () => {
  it("escapes ** inside bold runs", () => {
    const doc: WdfDocument = {
      schema: "weimo.document",
      version: 1,
      root: {
        type: "doc",
        content: [paragraph([WdfText.bold("a**b")])],
      },
    };
    expect(toMarkdown(doc)).toBe("**a\\**b**\n");
  });

  it("renders empty lines in quotes and lists without trailing spaces", () => {
    const doc: WdfDocument = {
      schema: "weimo.document",
      version: 1,
      root: {
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [paragraph([WdfText.plain("a\nb")])],
          },
        ],
      },
    };
    expect(toMarkdown(doc)).toBe("> a\n> b\n");
  });
});
