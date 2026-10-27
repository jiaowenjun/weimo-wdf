import type { Diagnostic } from "./diagnostic.js";

/** Value of the `schema` field in every WDF v0.1 document: `"weimo.document"`. */
export const WDF_SCHEMA = "weimo.document";

/** Value of the `version` field in every WDF v0.1 document. */
export const WDF_VERSION = 1;

/**
 * The canonical WDF document.
 *
 * This is the model every adapter converts into and out of. Instances coming
 * out of {@link validateAndCanonicalize} (directly or via a `from*` adapter)
 * are canonical: `type` strings are normalized, ordered lists always carry
 * `attrs.start`, empty text runs are dropped and adjacent runs with equal
 * marks are merged. `JSON.stringify(doc)` produces canonical WDF JSON.
 */
export interface WdfDocument {
  /** Always {@link WDF_SCHEMA} after canonicalization. */
  schema: string;
  /** Always {@link WDF_VERSION} after canonicalization. */
  version: number;
  /** The document root; `type` is `"doc"`. */
  root: WdfRoot;
}

/** The root node of a {@link WdfDocument}. An empty document is invalid. */
export interface WdfRoot {
  type: "doc";
  content: WdfBlock[];
}

/** Heading attributes: the ATX level, 1–6. */
export interface HeadingAttrs {
  level: number;
}

/** Ordered-list attributes: the first item number, at least 1. */
export interface OrderedListAttrs {
  start: number;
}

/**
 * A block-level node. Canonical ordered lists always carry `attrs.start`.
 */
export type WdfBlock =
  | { type: "paragraph"; content: WdfText[] }
  | { type: "heading"; attrs: HeadingAttrs; content: WdfText[] }
  | { type: "blockquote"; content: WdfParagraph[] }
  | { type: "bullet_list"; content: WdfListItem[] }
  | { type: "ordered_list"; attrs: OrderedListAttrs; content: WdfListItem[] };

/**
 * A paragraph, either at the top level or inside a blockquote/list item.
 */
export interface WdfParagraph {
  type: "paragraph";
  content: WdfText[];
}

/** A list item; canonical items contain exactly one paragraph. */
export interface WdfListItem {
  type: "list_item";
  /** Exactly one paragraph in canonical documents. */
  content: [WdfParagraph];
}

/**
 * An inline text run. `bold` is the only supported mark in v0.1; `marks` is
 * present only when the run is bold.
 */
export interface WdfText {
  type: "text";
  text: string;
  marks?: WdfMark[];
}

/** An inline mark. `"bold"` is the only valid type in v0.1. */
export interface WdfMark {
  type: "bold";
}

/** The outcome of every `from*` / validate entry point. */
export type WdfResult =
  | { ok: true; value: WdfDocument }
  | { ok: false; diagnostics: Diagnostic[] };

export namespace WdfDocument {
  /** An empty document: one empty paragraph, valid out of the box. */
  export function empty(): WdfDocument {
    return {
      schema: WDF_SCHEMA,
      version: WDF_VERSION,
      root: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    };
  }
}

export namespace WdfText {
  /** A run without marks. */
  export function plain(text: string): WdfText {
    return { type: "text", text };
  }

  /** A run carrying a single `bold` mark. */
  export function bold(text: string): WdfText {
    return { type: "text", text, marks: [{ type: "bold" }] };
  }

  /** Whether this run carries a `bold` mark. */
  export function isBold(text: WdfText): boolean {
    return text.marks?.some((mark) => mark.type === "bold") ?? false;
  }
}

/** Builds a paragraph from inline runs: `paragraph([WdfText.plain("hi")])`. */
export function paragraph(content: WdfText[]): WdfParagraph {
  return { type: "paragraph", content };
}

/** Builds a list item whose single paragraph wraps the given inline runs. */
export function listItem(content: WdfText[]): WdfListItem {
  return { type: "list_item", content: [paragraph(content)] };
}
