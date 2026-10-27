import { diagnosticError, type Diagnostic } from "../diagnostic.js";
import { isObject } from "../internal/guards.js";
import { WDF_SCHEMA, WDF_VERSION, WdfText, type WdfDocument, type WdfResult } from "../model.js";
import { validateAndCanonicalize } from "../validate.js";

/** Tiptap/ProseMirror wire types — the shapes `toTiptap` produces. */
export interface TiptapText {
  type: "text";
  text: string;
  marks?: { type: "bold" }[];
}
export interface TiptapParagraph {
  type: "paragraph";
  content: TiptapText[];
}
export interface TiptapHeading {
  type: "heading";
  attrs: { level: number };
  content: TiptapText[];
}
export interface TiptapBlockquote {
  type: "blockquote";
  content: TiptapParagraph[];
}
export interface TiptapListItem {
  type: "listItem";
  content: [TiptapParagraph];
}
export interface TiptapBulletList {
  type: "bulletList";
  content: TiptapListItem[];
}
export interface TiptapOrderedList {
  type: "orderedList";
  attrs: { start: number };
  content: TiptapListItem[];
}
export type TiptapBlock =
  | TiptapParagraph
  | TiptapHeading
  | TiptapBlockquote
  | TiptapBulletList
  | TiptapOrderedList;
export interface TiptapDocument {
  type: "doc";
  content: TiptapBlock[];
}

/**
 * Parses Tiptap/ProseMirror editor JSON into a canonical {@link WdfDocument}.
 *
 * Node names use ProseMirror camelCase: `doc`, `paragraph`, `heading`,
 * `blockquote`, `bulletList`, `orderedList` (with `attrs.start`), `listItem`
 * and `text` nodes with the `bold` mark. Unknown node types, non-text inline
 * nodes and marks other than a single `bold` are rejected with
 * `prosemirror.*` diagnostics.
 *
 * ```ts
 * import { fromTiptap } from "weimo-wdf";
 *
 * const result = fromTiptap({
 *   type: "doc",
 *   content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
 * });
 * ```
 */
export function fromTiptap(value: unknown): WdfResult {
  const diagnostics: Diagnostic[] = [];
  if (!isObject(value)) {
    return {
      ok: false,
      diagnostics: [
        diagnosticError("prosemirror", "prosemirror.invalid_document", "document must be an object"),
      ],
    };
  }
  if (value.type !== "doc") {
    return {
      ok: false,
      diagnostics: [
        diagnosticError("prosemirror", "prosemirror.invalid_document", "root type must be doc"),
      ],
    };
  }
  if (!Array.isArray(value.content)) {
    return {
      ok: false,
      diagnostics: [
        diagnosticError("prosemirror", "prosemirror.invalid_document", "doc content must be an array"),
      ],
    };
  }
  const blocks = value.content
    .map((block, index) => parseBlock(block, index, diagnostics))
    .filter((block): block is WdfBlockJson => block !== null);
  if (diagnostics.length === 0) {
    return validateAndCanonicalize(wdfEnvelope(blocks));
  }
  return { ok: false, diagnostics };
}

/** WDF JSON block shapes fed back through the validator. */
interface WdfBlockJson {
  type: string;
  attrs?: { level?: unknown; start?: unknown };
  content?: unknown[];
}

function wdfEnvelope(blocks: WdfBlockJson[]): unknown {
  return {
    schema: WDF_SCHEMA,
    version: WDF_VERSION,
    root: { type: "doc", content: blocks },
  };
}

/**
 * Mirrors the Rust adapter's `as_u64().unwrap_or(1) as u8/u32` attribute
 * narrowing: non-negative integers are taken modulo the target width, and
 * everything else defaults to 1.
 */
function tiptapAttr(raw: unknown, modulo: number): number {
  if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= Number.MAX_SAFE_INTEGER
  ) {
    return raw % modulo;
  }
  return 1;
}

function parseBlock(value: unknown, index: number, diagnostics: Diagnostic[]): WdfBlockJson | null {
  if (!isObject(value)) {
    diagnostics.push(
      diagnosticError(
        "prosemirror",
        "prosemirror.invalid_document",
        `block ${index} must be an object`,
      ),
    );
    return null;
  }
  const blockType = typeof value.type === "string" ? value.type : "";
  const content: unknown[] = Array.isArray(value.content) ? value.content : [];
  const attrs = isObject(value.attrs) ? value.attrs : {};
  switch (blockType) {
    case "paragraph":
      return { type: "paragraph", content: parseInline(content, diagnostics) };
    case "heading":
      return {
        type: "heading",
        attrs: { level: tiptapAttr(attrs.level, 256) },
        content: parseInline(content, diagnostics),
      };
    case "blockquote":
      return {
        type: "blockquote",
        content: content
          .map((item) => parseParagraph(item, diagnostics))
          .filter((item): item is { type: string; content: unknown[] } => item !== null),
      };
    case "bulletList":
      return {
        type: "bullet_list",
        content: content
          .map((item) => parseItem(item, diagnostics))
          .filter((item): item is WdfBlockJson => item !== null),
      };
    case "orderedList":
      return {
        type: "ordered_list",
        attrs: { start: tiptapAttr(attrs.start, 4294967296) },
        content: content
          .map((item) => parseItem(item, diagnostics))
          .filter((item): item is WdfBlockJson => item !== null),
      };
    default:
      diagnostics.push(
        diagnosticError(
          "prosemirror",
          "prosemirror.unsupported_node",
          `unsupported node type ${blockType}`,
        ),
      );
      return null;
  }
}

function parseParagraph(
  value: unknown,
  diagnostics: Diagnostic[],
): { type: string; content: unknown[] } | null {
  if (!isObject(value) || value.type !== "paragraph") {
    diagnostics.push(
      diagnosticError(
        "prosemirror",
        "prosemirror.invalid_document",
        "list and quote children must be paragraphs",
      ),
    );
    return null;
  }
  const content: unknown[] = Array.isArray(value.content) ? value.content : [];
  return { type: "paragraph", content: parseInline(content, diagnostics) };
}

function parseItem(value: unknown, diagnostics: Diagnostic[]): WdfBlockJson | null {
  if (!isObject(value) || value.type !== "listItem") {
    diagnostics.push(
      diagnosticError("prosemirror", "prosemirror.invalid_document", "list children must be listItem"),
    );
    return null;
  }
  const content: unknown[] = Array.isArray(value.content) ? value.content : [];
  if (content.length !== 1) {
    diagnostics.push(
      diagnosticError(
        "prosemirror",
        "prosemirror.invalid_document",
        "listItem must contain one paragraph",
      ),
    );
    return null;
  }
  const paragraph = parseParagraph(content[0], diagnostics);
  if (paragraph === null) return null;
  return { type: "list_item", content: [paragraph] };
}

function parseInline(content: unknown[], diagnostics: Diagnostic[]): unknown[] {
  const runs: unknown[] = [];
  for (const value of content) {
    if (!isObject(value) || value.type !== "text") {
      diagnostics.push(
        diagnosticError("prosemirror", "prosemirror.unsupported_node", "inline nodes must be text"),
      );
      continue;
    }
    const text = typeof value.text === "string" ? value.text : "";
    const marks = Array.isArray(value.marks) ? value.marks : undefined;
    if (marks) {
      if (
        marks.some((mark) => !isObject(mark) || mark.type !== "bold")
      ) {
        diagnostics.push(
          diagnosticError("prosemirror", "prosemirror.unsupported_mark", "only the bold mark is supported"),
        );
        continue;
      }
      if (marks.length > 1) {
        diagnostics.push(
          diagnosticError("prosemirror", "prosemirror.duplicate_mark", "bold may appear at most once"),
        );
        continue;
      }
    }
    const bold = marks?.some((mark) => isObject(mark) && mark.type === "bold") ?? false;
    runs.push(bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text });
  }
  return runs;
}

/**
 * Renders a {@link WdfDocument} as Tiptap/ProseMirror JSON
 * (`{"type":"doc",...}`).
 *
 * The output uses the same node names as {@link fromTiptap} accepts, with
 * `orderedList` always carrying `attrs.start`, so it can be loaded straight
 * into a Tiptap editor via `editor.commands.setContent(...)`.
 */
export function toTiptap(document: WdfDocument): TiptapDocument {
  return { type: "doc", content: document.root.content.map(blockToJson) };
}

function inline(content: WdfText[]): TiptapText[] {
  return content
    .filter((text) => text.text !== "")
    .map((text) => {
      if (WdfText.isBold(text)) {
        return { type: "text", text: text.text, marks: [{ type: "bold" }] };
      }
      return { type: "text", text: text.text };
    });
}

function paragraphJson(paragraph: { content: WdfText[] }): TiptapParagraph {
  return { type: "paragraph", content: inline(paragraph.content) };
}

function itemJson(item: { content: [{ content: WdfText[] }] }): TiptapListItem {
  return { type: "listItem", content: [paragraphJson(item.content[0]!)] };
}

function blockToJson(block: WdfDocument["root"]["content"][number]): TiptapBlock {
  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", content: inline(block.content) };
    case "heading":
      return { type: "heading", attrs: { level: block.attrs.level }, content: inline(block.content) };
    case "blockquote":
      return { type: "blockquote", content: block.content.map(paragraphJson) };
    case "bullet_list":
      return { type: "bulletList", content: block.content.map(itemJson) };
    case "ordered_list":
      return {
        type: "orderedList",
        attrs: { start: block.attrs.start },
        content: block.content.map(itemJson),
      };
  }
}
