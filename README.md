# weimo-wdf — Weimo Document Format (WDF)

[![npm](https://img.shields.io/npm/v/weimo-wdf.svg)](https://www.npmjs.com/package/weimo-wdf)
[![CI](https://github.com/jiaowenjun/weimo-wdf/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaowenjun/weimo-wdf/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/weimo-wdf.svg)](https://github.com/jiaowenjun/weimo-wdf/blob/main/LICENSE)

`weimo-wdf` implements **WDF**, the Weimo Document Format: a small, strict, canonical model for rich-text documents, plus adapters that convert between the formats editors actually speak: **Markdown**, **Tiptap / ProseMirror JSON**, **Apple document JSON**, and plain **text output**.

One model, five surfaces — with hard validation and no silent data loss.

> **Status:** v0.1 — an intentionally tiny node subset (see [Scope](#scope)). The API may still change before 1.0. The *format* is named WDF; the *package* is named `weimo-wdf`.

## Why WDF?

Applications that edit rich text usually end up with several representations of the same document: a web editor's ProseMirror JSON, a macOS app's `AttributedString` document, a Markdown export, a plain-text preview. Keeping N×N pairwise converters in sync is where documents get quietly corrupted.

`weimo-wdf` replaces that with one canonical model ([`WdfDocument`]) that every format converts into and out of:

```text
                 ┌───────────────┐
Markdown ───────▶│               │───────▶ Markdown
Apple doc  ─────▶│  WdfDocument  │───────▶ Tiptap / ProseMirror JSON
WDF JSON   ─────▶│  (canonical)  │───────▶ Apple document JSON
                 └───────────────┘───────▶ plain text
```

Typical uses:

- **Multi-editor apps** — a web frontend edits Tiptap JSON, a native frontend edits Apple document JSON, both validate against one canonical WDF document.
- **Import / export pipelines** — accept Markdown from users, hand structured JSON to the rest of your system, render previews as plain text.
- **Forms that must not guess** — untrusted input is either fully understood or rejected with machine-readable diagnostics; nothing is silently dropped or mangled.

## Scope

v0.1 models exactly this subset:

| Category | Supported |
| --- | --- |
| Blocks | paragraph, heading (level 1–6), blockquote, bullet list, ordered list |
| Inline | text runs with a single `bold` mark |
| Lists | one paragraph per item, no nesting |

Everything outside the subset — links, images, inline code, tables, italics, nested lists — is **rejected with a diagnostic on input**, never silently accepted or mangled. If you need a format beyond the subset, you get a precise error explaining what was unsupported, so you can decide how to handle it.

## Design

- **Canonical model.** All conversions pass through `WdfDocument`; adapters never convert formats into each other. N formats cost N adapters, not N×N bridges.
- **Strictness.** Unknown nodes, marks and properties, empty documents/lists, heading levels outside 1–6, list items that are not exactly one paragraph — all hard errors.
- **Canonicalization.** Accepted input is normalized before you see it: `\r\n` → `\n`, empty text runs dropped, adjacent runs with equal marks merged, ordered lists always carry an explicit `start`. Two documents compare equal only if they are semantically equal.
- **Diagnostics as data.** Failures are `Diagnostic` values with a stable machine-readable `code` (e.g. `wdf.unsupported_mark`, `markdown.unsupported_inline`, `prosemirror.unsupported_node`), a `source` layer, a JSON `path` to the offending node, and a human-readable message — ready to map onto editor squiggles or form errors.
- **Round-trip safe.** Anything `weimo-wdf` produces can be read back: `toMarkdown` output is always valid input for `fromMarkdown`, likewise for Tiptap and Apple JSON.
- **Frontend-first.** ESM-only, `sideEffects: false`, tree-shakeable. The main entry has zero runtime dependencies; only the `weimo-wdf/markdown` subpath pulls in markdown-it (~30 KB gzip), loaded on demand.

A side-by-side reference of all four wire formats — envelopes, node mappings, structural divergences, canonicalization edges and per-format strictness — lives in [`docs/format-reference.md`](docs/format-reference.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `src/`, `test/` | Package source and vitest suites |
| `demo/` | Live demo page (not part of the npm package) |
| `fixtures/`, `docs/`, `schema/` | Conformance fixtures, format reference, and JSON Schema |

## Getting started

```bash
npm install weimo-wdf
```

Requires a modern runtime with ESM support. TypeScript types ship with the package.

### Convert Markdown for a web editor

```ts
import { toTiptap } from "weimo-wdf";
import { fromMarkdown } from "weimo-wdf/markdown";

const result = fromMarkdown("# Release notes\n\n- **bold** item\n");
if (result.ok) {
  const tiptap = toTiptap(result.value);
  // hand `tiptap` to your Tiptap editor; it round-trips with fromTiptap
}
```

### Validate untrusted documents

```ts
import { validateAndCanonicalize } from "weimo-wdf";

const input = {
  schema: "weimo.document",
  version: 1,
  root: { type: "doc", content: [
    { type: "paragraph", content: [
      { type: "text", text: "hi", marks: [{ type: "italic" }] },
    ]},
  ]},
};
const result = validateAndCanonicalize(input);
if (!result.ok) {
  result.diagnostics.some((d) => d.code === "wdf.unsupported_mark"); // true
}
// valid input: result.value is a canonical WdfDocument, and
// JSON.stringify(result.value) is canonical WDF JSON
```

### Render plain text

```ts
import { renderPlain } from "weimo-wdf";
import { fromMarkdown } from "weimo-wdf/markdown";

const result = fromMarkdown("# Notes\n\n- **bold** item\n");
if (result.ok) {
  renderPlain(result.value); // "# Notes\n\n- bold item\n" — previews, copy buttons
}
```

### Build documents in code

```ts
import { WdfText, listItem } from "weimo-wdf";
import { toMarkdown } from "weimo-wdf/markdown";

const doc = {
  schema: "weimo.document",
  version: 1,
  root: { type: "doc", content: [
    { type: "bullet_list", content: [listItem([WdfText.plain("done "), WdfText.bold("now")])] },
  ]},
};
toMarkdown(doc); // "- done **now**\n"
```

## Demo

A live demo is published to GitHub Pages at <https://jiaowenjun.github.io/weimo-wdf/> (deployed by [`pages.yml`](.github/workflows/pages.yml) on every push to `main`). To run it locally, build the package, serve the repository root, and open <http://127.0.0.1:8421/demo/>:

```bash
npm run build
python3 -m http.server 8421   # or any static file server
```

The page imports the repo's actual `dist/` build in the browser, so it exercises exactly what npm consumers get: live Markdown / WDF JSON input, canonicalization, WDF / Tiptap / Apple / Markdown / plain-text outputs, and structured diagnostics for out-of-subset input. The single `markdown-it` dependency of the `weimo-wdf/markdown` subpath is loaded from esm.sh via an import map, so the demo needs network access for that one module.

## API at a glance

| Entry point | Function | Purpose |
| --- | --- | --- |
| `weimo-wdf` | `validateAndCanonicalize` | WDF JSON in → canonical `WdfDocument` or diagnostics |
| `weimo-wdf` | `fromTiptap` / `toTiptap` | Tiptap / ProseMirror JSON ⇄ canonical model |
| `weimo-wdf` | `fromApple` / `toApple` | Apple document JSON (`{"type":"apple.document",…}`) ⇄ canonical model |
| `weimo-wdf` | `renderPlain` | Canonical model → plain text (no escape codes) |
| `weimo-wdf` | `WdfDocument`, `WdfText`, `paragraph`, `listItem` | The model itself, with builder helpers |
| `weimo-wdf/markdown` | `fromMarkdown` / `toMarkdown` | Markdown ⇄ canonical model |

Every `from*` function and `validateAndCanonicalize` returns a `WdfResult`:

```ts
type WdfResult =
  | { ok: true; value: WdfDocument }
  | { ok: false; diagnostics: Diagnostic[] };
```

A JSON Schema describing WDF v0.1 JSON ships with the repo at [`schema/wdf-v0.1.schema.json`](schema/wdf-v0.1.schema.json) — useful for editor support and non-TypeScript validators; this package's validator remains the semantic authority.

## Non-goals

- Not a general-purpose Markdown parser or renderer (uses [markdown-it] under the hood, restricted to the supported subset).
- No persistence, networking, or runtime — bring your own storage and transport.
- No format negotiation or lossy "best effort" conversion; failure is explicit.
- No terminal ANSI rendering (`renderAnsi`); terminals are not a frontend scenario.

## Development

```bash
npm install
npm run check   # tsc --noEmit
npm test        # vitest, consumes fixtures/
npm run build   # tsc → dist/
```

## License

MIT.

## 中文说明

`weimo-wdf`（格式名 WDF，Weimo Document Format）是一个严格、可规范化的富文本文档模型 npm 包：以唯一的 canonical model（`WdfDocument`）为中心，在 Markdown、Tiptap/ProseMirror JSON、Apple document JSON 与纯文本输出之间做无损转换。未知节点、未知 mark、未知属性一律以结构化 diagnostics（含稳定错误码与 JSON 路径）拒绝，绝不静默丢弃或篡改数据。v0.1 只覆盖段落、标题、引用、两种列表与 `bold` 行内标记；表格外等超出范围的输入会得到明确报错。ESM-only、主入口零运行时依赖，适用于多端编辑器共享同一文档模型、Markdown 导入导出管线、以及需要严格校验外部输入的表单与前端场景。

<!-- links -->

[markdown-it]: https://www.npmjs.com/package/markdown-it
