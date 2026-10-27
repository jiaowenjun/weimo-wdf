/**
 * `weimo-wdf` — frontend TypeScript implementation of WDF, the Weimo
 * Document Format: one strict, canonical rich-text model with adapters for
 * the formats editors actually speak.
 *
 * Every conversion goes through the canonical {@link WdfDocument}. Adapters
 * never convert formats into each other directly:
 *
 * | Format | Direction | API |
 * | --- | --- | --- |
 * | WDF JSON (`weimo.document`) | in/out | {@link validateAndCanonicalize} + `JSON.stringify` |
 * | Tiptap / ProseMirror JSON | in/out | {@link fromTiptap}, {@link toTiptap} |
 * | Apple document JSON | in/out | {@link fromApple}, {@link toApple} |
 * | Markdown | in/out | `weimo-wdf/markdown` subpath: `fromMarkdown`, `toMarkdown` |
 * | Terminal-style text | out | {@link renderPlain} |
 *
 * Unknown nodes, unknown marks, unknown properties, empty documents/lists
 * and invalid heading levels are hard errors, reported as structured
 * {@link Diagnostic} values with stable machine-readable codes.
 */
export {
  WDF_SCHEMA,
  WDF_VERSION,
  // `WdfDocument` and `WdfText` merge an interface with a namespace of
  // builder helpers (WdfDocument.empty, WdfText.plain, …).
  WdfDocument,
  WdfText,
  paragraph,
  listItem,
} from "./model.js";
export type {
  HeadingAttrs,
  OrderedListAttrs,
  WdfBlock,
  WdfListItem,
  WdfMark,
  WdfParagraph,
  WdfResult,
  WdfRoot,
} from "./model.js";
export { diagnosticError } from "./diagnostic.js";
export type { Diagnostic, Diagnostics, DiagnosticPathSegment } from "./diagnostic.js";
export { validateAndCanonicalize } from "./validate.js";
export { renderPlain } from "./render.js";
export { fromTiptap, toTiptap } from "./adapters/tiptap.js";
export type {
  AppleBlock,
  AppleDocument,
  AppleParagraph,
  AppleRun,
} from "./adapters/apple.js";
export { fromApple, toApple } from "./adapters/apple.js";
export type {
  TiptapBlock,
  TiptapBlockquote,
  TiptapBulletList,
  TiptapDocument,
  TiptapHeading,
  TiptapListItem,
  TiptapOrderedList,
  TiptapParagraph,
  TiptapText,
} from "./adapters/tiptap.js";
