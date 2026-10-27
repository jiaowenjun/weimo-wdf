import { diagnosticError } from "../diagnostic.js";
import { isObject, isString, isU8, isU32 } from "../internal/guards.js";
import { WDF_SCHEMA, WDF_VERSION, WdfText, type WdfDocument, type WdfResult } from "../model.js";
import { validateAndCanonicalize } from "../validate.js";

/** Apple document wire types — the shapes `toApple` produces. */
export interface AppleRun {
  text: string;
  bold?: true;
}
export interface AppleParagraph {
  runs: AppleRun[];
}
export type AppleBlock =
  | { type: "paragraph"; runs: AppleRun[] }
  | { type: "heading"; level: number; runs: AppleRun[] }
  | { type: "blockquote"; paragraphs: AppleParagraph[] }
  | { type: "bullet_list"; items: AppleParagraph[] }
  | { type: "ordered_list"; start: number; items: AppleParagraph[] };
export interface AppleDocument {
  type: "apple.document";
  version: number;
  blocks: AppleBlock[];
}

// Internal, lenient wire shapes used while parsing (node types are free-form
// strings until the WDF validator judges them).
interface AppleWireRun {
  text: string;
  bold?: boolean;
}
interface AppleWireParagraph {
  runs: AppleWireRun[];
}
type AppleWireBlock =
  | { kind: "paragraph"; runs: AppleWireRun[] }
  | { kind: "heading"; level: number; runs: AppleWireRun[] }
  | { kind: "blockquote"; paragraphs: AppleWireParagraph[] }
  | { kind: "bullet_list"; items: AppleWireParagraph[] }
  | { kind: "ordered_list"; start: number; items: AppleWireParagraph[] };
interface AppleWireDocument {
  wireType: string;
  version: number;
  blocks: AppleWireBlock[];
}

/**
 * Parses Apple document JSON into a canonical {@link WdfDocument}.
 *
 * Expects the envelope `{"type":"apple.document","version":1,"blocks":[...]}`
 * with blocks carrying `runs` instead of inline text nodes. Unknown shapes
 * are rejected with `apple.*` diagnostics; unknown *properties* are ignored
 * (matching the Rust adapter's serde configuration).
 *
 * ```ts
 * import { fromApple } from "weimo-wdf";
 *
 * const result = fromApple({
 *   type: "apple.document",
 *   version: 1,
 *   blocks: [{ type: "paragraph", runs: [{ text: "hello" }] }],
 * });
 * ```
 */
export function fromApple(value: unknown): WdfResult {
  const parsed = parseAppleDocument(value);
  if (!parsed.ok) {
    return {
      ok: false,
      diagnostics: [diagnosticError("apple", "apple.invalid_document", parsed.error)],
    };
  }
  const wire = parsed.value;
  if (wire.wireType !== "apple.document" || wire.version !== 1) {
    return {
      ok: false,
      diagnostics: [
        diagnosticError(
          "apple",
          "apple.invalid_document",
          "type must be apple.document and version must be 1",
        ),
      ],
    };
  }
  return validateAndCanonicalize(wdfEnvelope(wire.blocks.map(wireBlockToWdf)));
}

/** Maps a parsed Apple wire block onto the WDF JSON shape the validator expects. */
function wireBlockToWdf(block: AppleWireBlock): unknown {
  switch (block.kind) {
    case "paragraph":
      return { type: "paragraph", content: runsToWdf(block.runs) };
    case "heading":
      return { type: "heading", attrs: { level: block.level }, content: runsToWdf(block.runs) };
    case "blockquote":
      return {
        type: "blockquote",
        content: block.paragraphs.map((paragraph) => ({
          type: "paragraph",
          content: runsToWdf(paragraph.runs),
        })),
      };
    case "bullet_list":
      return {
        type: "bullet_list",
        content: block.items.map((item) => ({
          type: "list_item",
          content: [{ type: "paragraph", content: runsToWdf(item.runs) }],
        })),
      };
    case "ordered_list":
      return {
        type: "ordered_list",
        attrs: { start: block.start },
        content: block.items.map((item) => ({
          type: "list_item",
          content: [{ type: "paragraph", content: runsToWdf(item.runs) }],
        })),
      };
  }
}

function runsToWdf(runs: AppleWireRun[]): unknown[] {
  return runs.map((run) =>
    run.bold === true
      ? { type: "text", text: run.text, marks: [{ type: "bold" }] }
      : { type: "text", text: run.text },
  );
}

function wdfEnvelope(blocks: unknown[]): unknown {
  return {
    schema: WDF_SCHEMA,
    version: WDF_VERSION,
    root: { type: "doc", content: blocks },
  };
}

function parseAppleDocument(value: unknown): { ok: true; value: AppleWireDocument } | { ok: false; error: string } {
  if (!isObject(value)) return { ok: false, error: "document must be an object" };
  if (!isString(value.type)) return { ok: false, error: "type must be a string" };
  if (!isU32(value.version)) return { ok: false, error: "version must be an unsigned 32-bit integer" };
  if (!Array.isArray(value.blocks)) return { ok: false, error: "blocks must be an array" };
  const blocks: AppleWireBlock[] = [];
  for (const [index, block] of value.blocks.entries()) {
    const parsed = parseAppleBlock(block);
    if (!parsed.ok) return { ok: false, error: `blocks[${index}]: ${parsed.error}` };
    blocks.push(parsed.value);
  }
  return { ok: true, value: { wireType: value.type, version: value.version, blocks } };
}

function parseAppleBlock(value: unknown): { ok: true; value: AppleWireBlock } | { ok: false; error: string } {
  if (!isObject(value)) return { ok: false, error: "block must be an object" };
  const type = value.type;
  if (!isString(type)) return { ok: false, error: "block type must be a string" };
  switch (type) {
    case "paragraph":
    case "heading": {
      const runs = parseAppleRuns(value.runs);
      if (!runs.ok) return { ok: false, error: runs.error };
      if (type === "paragraph") return { ok: true, value: { kind: "paragraph", runs: runs.value } };
      if (!isU8(value.level)) return { ok: false, error: "heading level must be an unsigned 8-bit integer" };
      return { ok: true, value: { kind: "heading", level: value.level, runs: runs.value } };
    }
    case "blockquote":
    case "bullet_list":
    case "ordered_list": {
      const groups = value.paragraphs ?? value.items;
      if (!Array.isArray(groups)) {
        return { ok: false, error: `${type} requires a ${type === "blockquote" ? "paragraphs" : "items"} array` };
      }
      const paragraphs: AppleWireParagraph[] = [];
      for (const [index, group] of groups.entries()) {
        if (!isObject(group)) return { ok: false, error: `group ${index} must be an object` };
        const runs = parseAppleRuns(group.runs);
        if (!runs.ok) return { ok: false, error: `group ${index}: ${runs.error}` };
        paragraphs.push({ runs: runs.value });
      }
      if (type === "blockquote") return { ok: true, value: { kind: "blockquote", paragraphs } };
      if (type === "bullet_list") return { ok: true, value: { kind: "bullet_list", items: paragraphs } };
      if (!isU32(value.start)) return { ok: false, error: "ordered_list start must be an unsigned 32-bit integer" };
      return { ok: true, value: { kind: "ordered_list", start: value.start, items: paragraphs } };
    }
    default:
      return { ok: false, error: `unknown block type ${type}` };
  }
}

function parseAppleRuns(value: unknown): { ok: true; value: AppleWireRun[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "runs must be an array" };
  const runs: AppleWireRun[] = [];
  for (const [index, run] of value.entries()) {
    if (!isObject(run)) return { ok: false, error: `runs[${index}] must be an object` };
    if (!isString(run.text)) return { ok: false, error: `runs[${index}].text must be a string` };
    if (run.bold !== undefined && typeof run.bold !== "boolean") {
      return { ok: false, error: `runs[${index}].bold must be a boolean` };
    }
    runs.push({ text: run.text, bold: run.bold });
  }
  return { ok: true, value: runs };
}

/**
 * Renders a {@link WdfDocument} as Apple document JSON.
 *
 * Inverse of {@link fromApple}: text becomes `runs` with an optional `bold`,
 * headings carry `level`, ordered lists carry `start`.
 */
export function toApple(document: WdfDocument): AppleDocument {
  return {
    type: "apple.document",
    version: 1,
    blocks: document.root.content.map(blockToApple),
  };
}

function runs(content: WdfText[]): AppleRun[] {
  return content
    .filter((text) => text.text !== "")
    .map((text) => {
      const run: AppleRun = { text: text.text };
      if (WdfText.isBold(text)) run.bold = true;
      return run;
    });
}

function runGroups(paragraphs: { content: WdfText[] }[]): AppleParagraph[] {
  return paragraphs.map((paragraph) => ({ runs: runs(paragraph.content) }));
}

function blockToApple(block: WdfDocument["root"]["content"][number]): AppleBlock {
  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", runs: runs(block.content) };
    case "heading":
      return { type: "heading", level: block.attrs.level, runs: runs(block.content) };
    case "blockquote":
      return { type: "blockquote", paragraphs: runGroups(block.content) };
    case "bullet_list":
      return {
        type: "bullet_list",
        items: block.content.map((item) => ({ runs: runs(item.content[0]!.content) })),
      };
    case "ordered_list":
      return {
        type: "ordered_list",
        start: block.attrs.start,
        items: block.content.map((item) => ({ runs: runs(item.content[0]!.content) })),
      };
  }
}
