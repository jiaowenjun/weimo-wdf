# weimo-wdf — Weimo Document Format (WDF)

[![Crates.io](https://img.shields.io/crates/v/weimo-wdf.svg)](https://crates.io/crates/weimo-wdf)
[![Documentation](https://docs.rs/weimo-wdf/badge.svg)](https://docs.rs/weimo-wdf)
[![CI](https://github.com/jiaowenjun/weimo-wdf-rs/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaowenjun/weimo-wdf-rs/actions/workflows/ci.yml)
[![License](https://img.shields.io/crates/l/weimo-wdf.svg)](https://github.com/jiaowenjun/weimo-wdf-rs/blob/main/LICENSE)

`weimo-wdf` implements **WDF**, the Weimo Document Format: a small, strict, canonical model for rich-text documents, plus adapters that convert between the formats editors actually speak: **Markdown**, **Tiptap / ProseMirror JSON**, **Apple document JSON**, and plain **terminal output**.

One model, five surfaces — with hard validation and no silent data loss.

> **Status:** v0.1 — an intentionally tiny node subset (see [Scope](#scope)). The API may still change; semantic versioning starts at the first crates.io release. The *format* is named WDF; the *crate* is named `weimo-wdf` (the Rust implementation, aligned with the TypeScript package of the same name).

## Why WDF?

Applications that edit rich text usually end up with several representations of the same document: a web editor's ProseMirror JSON, a macOS app's `AttributedString` document, a Markdown export, a CLI preview. Keeping N×N pairwise converters in sync is where documents get quietly corrupted.

`weimo-wdf` replaces that with one canonical model ([`WdfDocument`]) that every format converts into and out of:

```text
                 ┌───────────────┐
Markdown ───────▶│               │───────▶ Markdown
Apple doc  ─────▶│  WdfDocument  │───────▶ Tiptap / ProseMirror JSON
WDF JSON   ─────▶│  (canonical)  │───────▶ Apple document JSON
                 └───────────────┘───────▶ terminal plain / ANSI
```

Typical uses:

- **Multi-editor apps** — a web frontend edits Tiptap JSON, a native frontend edits Apple document JSON, the server stores and validates one canonical WDF document.
- **Import / export pipelines** — accept Markdown from users, hand structured JSON to the rest of your system, render previews in a terminal.
- **APIs that must not guess** — untrusted input is either fully understood or rejected with machine-readable diagnostics; nothing is silently dropped or mangled.

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
- **Diagnostics as data.** Failures are `Diagnostic` values with a stable machine-readable `code` (e.g. `wdf.unsupported_mark`, `markdown.unsupported_code`, `prosemirror.unsupported_node`), a `source` layer, a JSON `path` to the offending node, and a human-readable message — ready to map onto an HTTP 422 body or editor squiggles.
- **Round-trip safe.** Anything `weimo-wdf` produces can be read back: `to_markdown` output is always valid input for `from_markdown`, likewise for Tiptap and Apple JSON.

A side-by-side reference of all four wire formats — envelopes, node mappings, structural divergences, canonicalization edges and per-format strictness — lives in [`docs/format-reference.md`](docs/format-reference.md).

## Getting started

```toml
[dependencies]
weimo-wdf = "0.1"
```

Requires Rust 1.88+ (edition 2024, let-chains). No crate features, no `unsafe`, no I/O — pure data in, data out. The crate name is `weimo-wdf`; in Rust code, import it as `weimo_wdf` (hyphens map to underscores).

### Convert Markdown for a web editor

```rust
use weimo_wdf::{from_markdown, to_tiptap};

let doc = from_markdown("# Release notes\n\n- **bold** item\n")
    .expect("supported markdown");
let tiptap = to_tiptap(&doc);
// hand `tiptap` to your Tiptap editor; it round-trips with from_tiptap
```

### Validate untrusted documents

```rust
use serde_json::json;
use weimo_wdf::validate_and_canonicalize;

let input = json!({
    "schema": "weimo.document",
    "version": 1,
    "root": { "type": "doc", "content": [
        { "type": "paragraph", "content": [
            { "type": "text", "text": "hi", "marks": [{"type": "italic"}] }
        ]}
    ]}
});
let diagnostics = validate_and_canonicalize(&input).unwrap_err();
assert!(diagnostics.iter().any(|d| d.code == "wdf.unsupported_mark"));
```

Valid input returns a canonical `WdfDocument`, which serializes back to canonical WDF JSON with `serde_json::to_value(&doc)`.

### Render for terminals

```rust
use weimo_wdf::{from_markdown, render_plain, render_ansi};

let doc = from_markdown("# Notes\n\n- **bold** item\n").unwrap();
let plain = render_plain(&doc);   // "# Notes\n\n- bold item\n" — logs, pipes
let ansi  = render_ansi(&doc);    // same, with ANSI bold — interactive terminals
```

### Build documents in code

```rust
use weimo_wdf::{WdfBlock, WdfDocument, WdfRoot, WdfText, WDF_SCHEMA, WDF_VERSION, list_item, to_markdown};

let doc = WdfDocument {
    schema: WDF_SCHEMA.into(),
    version: WDF_VERSION,
    root: WdfRoot {
        node_type: "doc".into(),
        content: vec![WdfBlock::BulletList {
            content: vec![list_item(vec![WdfText::plain("done "), WdfText::bold("now")])],
        }],
    },
};
assert_eq!(to_markdown(&doc), "- done **now**\n");
```

## API at a glance

| Function | Purpose |
| --- | --- |
| `validate_and_canonicalize` | WDF JSON in → canonical `WdfDocument` or diagnostics |
| `from_markdown` / `to_markdown` | Markdown ⇄ canonical model |
| `from_tiptap` / `to_tiptap` | Tiptap / ProseMirror JSON ⇄ canonical model |
| `from_apple` / `to_apple` | Apple document JSON (`{"type":"apple.document",...}`) ⇄ canonical model |
| `render_plain` / `render_ansi` | Canonical model → terminal text |
| `WdfDocument`, `WdfBlock`, `WdfText`, … | The model itself; serde-serializable, constructible in code |

Full API documentation with examples is rendered by docs.rs once published; run `cargo doc --open` locally in the meantime. A JSON Schema describing WDF v0.1 JSON ships with the crate at [`schema/wdf-v0.1.schema.json`](schema/wdf-v0.1.schema.json) — useful for editor support and non-Rust validators; the Rust validator remains the semantic authority.

## Non-goals

- Not a general-purpose Markdown parser or renderer (uses [pulldown-cmark] under the hood, restricted to the supported subset).
- No persistence, networking, or runtime — bring your own storage and transport.
- No format negotiation or lossy "best effort" conversion; failure is explicit.

## License

MIT.

## 中文说明

`weimo-wdf`（格式名 WDF，Weimo Document Format；与 TypeScript 版 `weimo-wdf` 同名对齐）是一个严格、可规范化的富文本文档模型 crate：以唯一的 canonical model（`WdfDocument`）为中心，在 Markdown、Tiptap/ProseMirror JSON、Apple document JSON 与终端纯文本/ANSI 输出之间做无损转换。未知节点、未知 mark、未知属性一律以结构化 diagnostics（含稳定错误码与 JSON 路径）拒绝，绝不静默丢弃或篡改数据。v0.1 只覆盖段落、标题、引用、两种列表与 `bold` 行内标记；表格外等超出范围的输入会得到明确报错。适用于多端编辑器共享同一服务端文档模型、Markdown 导入导出管线、以及需要严格校验外部输入的 API。

<!-- links -->

[pulldown-cmark]: https://crates.io/crates/pulldown-cmark
