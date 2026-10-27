import { diagnosticError, type Diagnostic, type DiagnosticPathSegment } from "./diagnostic.js";
import { isObject, isString, isU8, isU32 } from "./internal/guards.js";
import {
  WDF_SCHEMA,
  WDF_VERSION,
  WdfText,
  type WdfBlock,
  type WdfDocument,
  type WdfResult,
} from "./model.js";

/**
 * Validates WDF JSON and returns the canonical {@link WdfDocument}.
 *
 * This is the only supported entry point for untrusted WDF input. It checks
 * the `schema`/`version` envelope, rejects unknown properties, nodes, marks
 * and structurally invalid content (empty documents/lists, heading levels
 * outside 1–6, list items that are not exactly one paragraph), and then
 * canonicalizes:
 *
 * - `\r\n` and `\r` newlines become `\n`;
 * - empty text runs are dropped;
 * - adjacent runs with equal marks are merged;
 * - ordered lists get an explicit `attrs: { start: 1 }` when omitted.
 *
 * Every violation is returned as a `Diagnostic` — never as a thrown exception.
 *
 * ```ts
 * import { validateAndCanonicalize } from "weimo-wdf";
 *
 * const result = validateAndCanonicalize({
 *   schema: "weimo.document",
 *   version: 1,
 *   root: { type: "doc", content: [
 *     { type: "paragraph", content: [{ type: "text", text: "hello" }] },
 *   ]},
 * });
 * if (result.ok) console.log(result.value.root.content.length); // 1
 * ```
 */
export function validateAndCanonicalize(value: unknown): WdfResult {
  const diagnostics: Diagnostic[] = [];
  rejectUnknownProperties(value, diagnostics, []);
  const parsed = parseDocument(value);
  if (!parsed.ok) {
    diagnostics.push(diagnosticError("wdf", "wdf.invalid_document", parsed.error));
    return { ok: false, diagnostics };
  }
  const document = parsed.value;
  if (document.schema !== WDF_SCHEMA) {
    diagnostics.push(
      diagnosticError("wdf", "wdf.invalid_schema", "schema must be weimo.document"),
    );
  }
  if (document.version !== WDF_VERSION) {
    diagnostics.push(diagnosticError("wdf", "wdf.invalid_version", "version must be 1"));
  }
  if (document.root.nodeType !== "doc") {
    diagnostics.push(diagnosticError("wdf", "wdf.invalid_root", "root type must be doc"));
  }
  if (document.root.content.length === 0) {
    diagnostics.push(
      diagnosticError("wdf", "wdf.empty_document", "document must contain at least one block"),
    );
  }
  validateBlocks(document.root.content, diagnostics);
  if (diagnostics.length === 0) {
    return { ok: true, value: canonicalize(document) };
  }
  return { ok: false, diagnostics };
}

// ---------------------------------------------------------------------------
// Unknown-property rejection
// ---------------------------------------------------------------------------

function rejectUnknownProperties(
  value: unknown,
  diagnostics: Diagnostic[],
  path: DiagnosticPathSegment[],
): void {
  if (!isObject(value)) return;
  const isMarkObject = path.length >= 2 && path[path.length - 2] === "marks";
  let allowed: readonly string[];
  if (isMarkObject) {
    allowed = ["type"];
  } else {
    const last = path[path.length - 1];
    if (last === "root") {
      allowed = ["type", "content"];
    } else if (last === "attrs") {
      allowed = ["level", "start"];
    } else if (last === "marks") {
      allowed = ["type"];
    } else {
      const type = isString(value.type) ? value.type : undefined;
      switch (type) {
        case "paragraph":
        case "list_item":
          allowed = ["type", "content"];
          break;
        case "heading":
          allowed = ["type", "attrs", "content"];
          break;
        case "blockquote":
        case "bullet_list":
          allowed = ["type", "content"];
          break;
        case "ordered_list":
          allowed = ["type", "attrs", "content"];
          break;
        case "text":
          allowed = ["type", "text", "marks"];
          break;
        case "doc":
          allowed = ["type", "content"];
          break;
        case "bold":
          allowed = ["type"];
          break;
        default:
          allowed = ["schema", "version", "root"];
      }
    }
  }
  // Iterate in sorted key order, matching serde's ordered JSON maps.
  for (const key of Object.keys(value).sort()) {
    if (!allowed.includes(key)) {
      diagnostics.push(
        diagnosticError("wdf", "wdf.unknown_property", `unknown property ${key}`, [
          ...path,
          key,
        ]),
      );
    }
  }
  for (const [key, child] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (key === "root" || key === "attrs" || key === "marks") {
      rejectUnknownProperties(child, diagnostics, [...path, key]);
    } else if (key === "content" && Array.isArray(child)) {
      child.forEach((item, index) => {
        rejectUnknownProperties(item, diagnostics, [...path, key, index]);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Strict shape parsing (replaces serde deserialization)
// ---------------------------------------------------------------------------

interface RawText {
  nodeType: string;
  text: string;
  marks?: { markType: string }[];
}
interface RawParagraph {
  nodeType: string;
  content: RawText[];
}
interface RawListItem {
  nodeType: string;
  content: RawParagraph[];
}
type RawBlock =
  | { kind: "paragraph"; content: RawText[] }
  | { kind: "heading"; attrs: { level: number }; content: RawText[] }
  | { kind: "blockquote"; content: RawParagraph[] }
  | { kind: "bullet_list"; content: RawListItem[] }
  | { kind: "ordered_list"; attrs?: { start: number }; content: RawListItem[] };
interface RawDocument {
  schema: string;
  version: number;
  root: { nodeType: string; content: RawBlock[] };
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function parseDocument(value: unknown): ParseResult<RawDocument> {
  if (!isObject(value)) return fail("document must be an object");
  if (!isString(value.schema)) return fail("schema must be a string");
  if (!isU32(value.version)) return fail("version must be an unsigned 32-bit integer");
  if (!isObject(value.root)) return fail("root must be an object");
  const root = value.root;
  if (!isString(root.type)) return fail("root.type must be a string");
  if (!Array.isArray(root.content)) return fail("root.content must be an array");
  const blocks: RawBlock[] = [];
  for (const [index, block] of root.content.entries()) {
    const parsed = parseBlock(block);
    if (!parsed.ok) return fail(`root.content[${index}]: ${parsed.error}`);
    blocks.push(parsed.value);
  }
  return {
    ok: true,
    value: { schema: value.schema, version: value.version, root: { nodeType: root.type, content: blocks } },
  };
}

function parseBlock(value: unknown): ParseResult<RawBlock> {
  if (!isObject(value)) return fail("block must be an object");
  const type = value.type;
  if (!isString(type)) return fail("block type must be a string");
  switch (type) {
    case "paragraph":
    case "heading": {
      const content = parseTextArray(value.content);
      if (!content.ok) return fail(content.error);
      if (type === "paragraph") {
        return { ok: true, value: { kind: "paragraph", content: content.value } };
      }
      const attrs = isObject(value.attrs) ? value.attrs : undefined;
      if (!attrs || !isU8(attrs.level)) {
        return fail("heading attrs.level must be an unsigned 8-bit integer");
      }
      return {
        ok: true,
        value: { kind: "heading", attrs: { level: attrs.level }, content: content.value },
      };
    }
    case "blockquote":
    case "bullet_list":
    case "ordered_list": {
      if (!Array.isArray(value.content)) return fail("content must be an array");
      const items: unknown[] = value.content;
      if (type === "blockquote") {
        const paragraphs: RawParagraph[] = [];
        for (const [index, item] of items.entries()) {
          const parsed = parseParagraph(item);
          if (!parsed.ok) return fail(`content[${index}]: ${parsed.error}`);
          paragraphs.push(parsed.value);
        }
        return { ok: true, value: { kind: "blockquote", content: paragraphs } };
      }
      const listItems: RawListItem[] = [];
      for (const [index, item] of items.entries()) {
        const parsed = parseListItem(item);
        if (!parsed.ok) return fail(`content[${index}]: ${parsed.error}`);
        listItems.push(parsed.value);
      }
      if (type === "bullet_list") {
        return { ok: true, value: { kind: "bullet_list", content: listItems } };
      }
      let attrs: { start: number } | undefined;
      if (value.attrs !== undefined) {
        const attrsObject = isObject(value.attrs) ? value.attrs : undefined;
        if (!attrsObject || !isU32(attrsObject.start)) {
          return fail("ordered_list attrs.start must be an unsigned 32-bit integer");
        }
        attrs = { start: attrsObject.start };
      }
      return { ok: true, value: { kind: "ordered_list", attrs, content: listItems } };
    }
    default:
      return fail(`unknown block type ${type}`);
  }
}

function parseParagraph(value: unknown): ParseResult<RawParagraph> {
  if (!isObject(value)) return fail("paragraph must be an object");
  if (!isString(value.type)) return fail("paragraph type must be a string");
  const content = parseTextArray(value.content);
  if (!content.ok) return fail(content.error);
  return { ok: true, value: { nodeType: value.type, content: content.value } };
}

function parseListItem(value: unknown): ParseResult<RawListItem> {
  if (!isObject(value)) return fail("list_item must be an object");
  if (!isString(value.type)) return fail("list_item type must be a string");
  if (!Array.isArray(value.content)) return fail("list_item content must be an array");
  const paragraphs: RawParagraph[] = [];
  for (const [index, item] of value.content.entries()) {
    const parsed = parseParagraph(item);
    if (!parsed.ok) return fail(`content[${index}]: ${parsed.error}`);
    paragraphs.push(parsed.value);
  }
  return { ok: true, value: { nodeType: value.type, content: paragraphs } };
}

function parseTextArray(value: unknown): ParseResult<RawText[]> {
  if (!Array.isArray(value)) return fail("content must be an array");
  const texts: RawText[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item)) return fail(`content[${index}] must be an object`);
    if (!isString(item.type)) return fail(`content[${index}].type must be a string`);
    if (!isString(item.text)) return fail(`content[${index}].text must be a string`);
    let marks: { markType: string }[] | undefined;
    if (item.marks !== undefined) {
      if (!Array.isArray(item.marks)) return fail(`content[${index}].marks must be an array`);
      marks = [];
      for (const [markIndex, mark] of item.marks.entries()) {
        if (!isObject(mark) || !isString(mark.type)) {
          return fail(`content[${index}].marks[${markIndex}] must be a mark object`);
        }
        marks.push({ markType: mark.type });
      }
    }
    texts.push({ nodeType: item.type, text: item.text, marks });
  }
  return { ok: true, value: texts };
}

// ---------------------------------------------------------------------------
// Semantic validation
// ---------------------------------------------------------------------------

function validateBlocks(blocks: RawBlock[], diagnostics: Diagnostic[]): void {
  for (const [index, block] of blocks.entries()) {
    switch (block.kind) {
      case "paragraph":
        validateInline(block.content, diagnostics);
        break;
      case "heading":
        if (block.attrs.level < 1 || block.attrs.level > 6) {
          diagnostics.push(
            diagnosticError(
              "wdf",
              "wdf.invalid_heading_level",
              "heading level must be between 1 and 6",
              ["root", "content", index, "attrs", "level"],
            ),
          );
        }
        validateInline(block.content, diagnostics);
        break;
      case "blockquote":
        if (block.content.length === 0) {
          diagnostics.push(
            diagnosticError("wdf", "wdf.invalid_blockquote", "blockquote must contain a paragraph"),
          );
        }
        for (const paragraph of block.content) {
          validateParagraph(paragraph, diagnostics);
        }
        break;
      case "bullet_list":
        validateList(block.content, undefined, diagnostics);
        break;
      case "ordered_list":
        validateList(block.content, block.attrs?.start, diagnostics);
        break;
    }
  }
}

function validateParagraph(paragraph: RawParagraph, diagnostics: Diagnostic[]): void {
  if (paragraph.nodeType !== "paragraph") {
    diagnostics.push(
      diagnosticError("wdf", "wdf.invalid_paragraph", "paragraph type must be paragraph"),
    );
  }
  validateInline(paragraph.content, diagnostics);
}

function validateList(
  items: RawListItem[],
  start: number | undefined,
  diagnostics: Diagnostic[],
): void {
  if (items.length === 0) {
    diagnostics.push(
      diagnosticError("wdf", "wdf.empty_list", "list must contain at least one list item"),
    );
  }
  if (start === 0) {
    diagnostics.push(
      diagnosticError("wdf", "wdf.invalid_list_start", "ordered list start must be at least 1"),
    );
  }
  for (const item of items) {
    if (item.nodeType !== "list_item" || item.content.length !== 1) {
      diagnostics.push(
        diagnosticError("wdf", "wdf.invalid_list_item", "list item must contain exactly one paragraph"),
      );
      continue;
    }
    validateParagraph(item.content[0]!, diagnostics);
  }
}

function validateInline(content: RawText[], diagnostics: Diagnostic[]): void {
  for (const text of content) {
    if (text.nodeType !== "text") {
      diagnostics.push(
        diagnosticError("wdf", "wdf.invalid_text_node", "inline node type must be text"),
      );
    }
    if (
      text.marks &&
      (text.marks.length > 1 || text.marks.some((mark) => mark.markType !== "bold"))
    ) {
      diagnostics.push(
        diagnosticError("wdf", "wdf.unsupported_mark", "only one bold mark is supported"),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

function canonicalize(document: RawDocument): WdfDocument {
  return {
    schema: WDF_SCHEMA,
    version: WDF_VERSION,
    root: {
      type: "doc",
      content: document.root.content.map(canonicalBlock),
    },
  };
}

function canonicalBlock(block: RawBlock): WdfBlock {
  switch (block.kind) {
    case "paragraph":
      return { type: "paragraph", content: canonicalInline(block.content) };
    case "heading":
      return {
        type: "heading",
        attrs: { level: block.attrs.level },
        content: canonicalInline(block.content),
      };
    case "blockquote":
      return {
        type: "blockquote",
        content: block.content.map(canonicalParagraph),
      };
    case "bullet_list":
      return { type: "bullet_list", content: block.content.map(canonicalItem) };
    case "ordered_list":
      return {
        type: "ordered_list",
        attrs: { start: block.attrs?.start ?? 1 },
        content: block.content.map(canonicalItem),
      };
  }
}

function canonicalParagraph(paragraph: RawParagraph): WdfParagraphCanonical {
  return { type: "paragraph", content: canonicalInline(paragraph.content) };
}

function canonicalItem(item: RawListItem): WdfListItemCanonical {
  const first = item.content[0];
  return {
    type: "list_item",
    content: [first ? canonicalParagraph(first) : { type: "paragraph", content: [] }],
  };
}

function canonicalInline(content: RawText[]): WdfTextCanonical[] {
  const result: WdfTextCanonical[] = [];
  for (const raw of content) {
    const text = raw.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (text === "") continue;
    const bold = raw.marks?.some((mark) => mark.markType === "bold") ?? false;
    const previous = result[result.length - 1];
    if (previous && WdfText.isBold(previous) === bold) {
      previous.text += text;
      continue;
    }
    result.push(bold ? WdfText.bold(text) : WdfText.plain(text));
  }
  return result;
}

// Local aliases so the canonicalizers above can reference the model types
// without importing them under clashing names.
type WdfParagraphCanonical = import("./model.js").WdfParagraph;
type WdfListItemCanonical = import("./model.js").WdfListItem;
type WdfTextCanonical = import("./model.js").WdfText;
