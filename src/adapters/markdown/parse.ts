import MarkdownIt from "markdown-it";
import { diagnosticError, type Diagnostic } from "../../diagnostic.js";
import { WDF_SCHEMA, WDF_VERSION, type WdfResult } from "../../model.js";
import { validateAndCanonicalize } from "../../validate.js";

/**
 * Parses Markdown into a canonical WDF document.
 *
 * The accepted subset matches what WDF v0.1 can represent: ATX and setext
 * headings, paragraphs, blockquotes containing paragraphs, top-level bullet
 * and ordered lists whose items are single paragraphs, `**bold**` spans, and
 * soft/hard line breaks. Anything else — inline code, links, images, code
 * blocks, nested lists, italic, HTML — is rejected with a
 * `markdown.unsupported_*` diagnostic instead of being silently dropped.
 */
export function fromMarkdown(input: string): WdfResult {
  const cursor = new Cursor(parser.parse(input, {}));
  const blocks = cursor.parseBlocks(undefined);
  if (cursor.diagnostics.length > 0) {
    return { ok: false, diagnostics: cursor.diagnostics };
  }
  return validateAndCanonicalize({
    schema: WDF_SCHEMA,
    version: WDF_VERSION,
    root: { type: "doc", content: blocks },
  });
}

// The `commonmark` preset matches pulldown-cmark's default capability set:
// no tables, no strikethrough — pipe tables degrade to plain paragraphs on
// both sides of the port.
const parser = new MarkdownIt("commonmark");

/** Structural subset of the markdown-it token shape this parser reads. */
interface MdToken {
  type: string;
  tag: string;
  attrs: [string, string][] | null;
  content: string;
  children: MdToken[] | null;
  nesting: number;
}

/** WDF JSON shapes handed to the validator. */
interface WdfJsonText {
  type: "text";
  text: string;
  marks?: { type: "bold" }[];
}
interface WdfJsonParagraph {
  type: "paragraph";
  content: WdfJsonText[];
}
interface WdfJsonItem {
  type: "list_item";
  content: [WdfJsonParagraph];
}
type WdfJsonBlock =
  | { type: "paragraph"; content: WdfJsonText[] }
  | { type: "heading"; attrs: { level: number }; content: WdfJsonText[] }
  | { type: "blockquote"; content: WdfJsonParagraph[] }
  | { type: "bullet_list"; content: WdfJsonItem[] }
  | { type: "ordered_list"; attrs: { start: number }; content: WdfJsonItem[] };

function run(text: string, bold: boolean): WdfJsonText {
  return bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text };
}

class Cursor {
  index = 0;
  diagnostics: Diagnostic[] = [];

  constructor(private readonly tokens: MdToken[]) {}

  parseBlocks(stop: string | undefined): WdfJsonBlock[] {
    const blocks: WdfJsonBlock[] = [];
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index]!;
      if (stop !== undefined && token.type === stop) {
        this.index++;
        break;
      }
      switch (token.type) {
        case "paragraph_open": {
          this.index++;
          blocks.push({ type: "paragraph", content: this.parseInline("paragraph_close") });
          break;
        }
        case "heading_open": {
          const level = Number.parseInt(token.tag.slice(1), 10);
          this.index++;
          blocks.push({
            type: "heading",
            attrs: { level: Number.isNaN(level) ? 1 : level },
            content: this.parseInline("heading_close"),
          });
          break;
        }
        case "blockquote_open": {
          this.index++;
          const content = this.parseBlocks("blockquote_close");
          const paragraphs: WdfJsonParagraph[] = [];
          for (const block of content) {
            if (block.type === "paragraph") {
              paragraphs.push(...splitParagraphLines(block.content));
            } else {
              this.unsupported("blockquote child");
            }
          }
          blocks.push({ type: "blockquote", content: paragraphs });
          break;
        }
        case "bullet_list_open": {
          this.index++;
          blocks.push({ type: "bullet_list", content: this.parseItems("bullet_list_close") });
          break;
        }
        case "ordered_list_open": {
          const start = orderedListStart(token);
          this.index++;
          blocks.push({
            type: "ordered_list",
            attrs: { start },
            content: this.parseItems("ordered_list_close"),
          });
          break;
        }
        default:
          this.unsupported("block");
          this.index++;
      }
    }
    return blocks;
  }

  /** Consumes one `inline` token's children plus the closing block token. */
  private parseInline(stop: string): WdfJsonText[] {
    const runs: WdfJsonText[] = [];
    const token = this.tokens[this.index];
    if (token && token.type === "inline") {
      this.index++;
      this.parseInlineChildren(token.children ?? [], 0, false, runs);
    }
    if (this.tokens[this.index]?.type === stop) {
      this.index++;
    }
    return runs;
  }

  /**
   * Walks inline children like pulldown-cmark's event stream: `strong_open`
   * recurses with bold, `strong_close` returns to the caller, closing tags
   * of unsupported spans are skipped silently (mirroring Rust's `End(_)`
   * arm).
   */
  private parseInlineChildren(
    children: MdToken[],
    start: number,
    bold: boolean,
    out: WdfJsonText[],
  ): number {
    let index = start;
    while (index < children.length) {
      const child = children[index]!;
      switch (child.type) {
        case "text":
        case "text_special":
          out.push(run(child.content, bold));
          index++;
          break;
        case "strong_open":
          index = this.parseInlineChildren(children, index + 1, true, out);
          break;
        case "strong_close":
          return index + 1;
        case "softbreak":
        case "hardbreak":
          out.push(run("\n", bold));
          index++;
          break;
        case "code_inline":
          this.unsupported("code");
          index++;
          break;
        default:
          if (child.nesting === -1) {
            index++;
            break;
          }
          this.unsupported("inline");
          index++;
      }
    }
    return index;
  }

  private parseItems(stop: string): WdfJsonItem[] {
    const items: WdfJsonItem[] = [];
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index]!;
      if (token.type === stop) {
        this.index++;
        break;
      }
      if (token.type === "list_item_open") {
        this.index++;
        const blocks = this.parseBlocks("list_item_close");
        if (blocks.length === 0) {
          // A bare "-" item: one empty paragraph, like pulldown-cmark's
          // tight-item path.
          items.push({ type: "list_item", content: [{ type: "paragraph", content: [] }] });
        } else if (blocks.length === 1 && blocks[0]!.type === "paragraph") {
          items.push({
            type: "list_item",
            content: [{ type: "paragraph", content: blocks[0]!.content }],
          });
        } else if (blocks.length === 1) {
          this.unsupported("list item");
        } else {
          this.unsupported("list item content");
        }
      } else {
        this.unsupported("list content");
        this.index++;
      }
    }
    return items;
  }

  private unsupported(kind: string): void {
    this.diagnostics.push(
      diagnosticError(
        "markdown",
        `markdown.unsupported_${kind}`,
        `Markdown ${kind} is outside the supported subset`,
      ),
    );
  }
}

/**
 * `0.` is a legal CommonMark start and must survive to the validator, which
 * rejects it with `wdf.invalid_list_start` — matching the Rust behavior.
 */
function orderedListStart(token: MdToken): number {
  const pair = token.attrs?.find(([key]) => key === "start");
  const value = pair === undefined ? Number.NaN : Number(pair[1]);
  return Number.isInteger(value) && value >= 0 ? value : 1;
}

/** Splits soft/hard-break runs into one paragraph per source line. */
function splitParagraphLines(content: WdfJsonText[]): WdfJsonParagraph[] {
  const paragraphs: WdfJsonText[][] = [[]];
  const bold = (text: WdfJsonText) => text.marks?.some((mark) => mark.type === "bold") ?? false;
  for (const text of content) {
    const parts = text.text.split("\n");
    parts.forEach((part, index) => {
      if (part !== "") {
        paragraphs[paragraphs.length - 1]!.push(run(part, bold(text)));
      }
      if (index + 1 < parts.length) {
        paragraphs.push([]);
      }
    });
  }
  return paragraphs
    .filter((content) => content.length > 0)
    .map((content) => ({ type: "paragraph", content }));
}
