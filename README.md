# weimo-wdf — Weimo Document Format (WDF)

**WDF** is a small, strict, canonical model for rich-text documents, plus adapters that convert between the formats editors actually speak: **Markdown**, **Tiptap / ProseMirror JSON**, **Apple document JSON**, and text output. One model, five surfaces — with hard validation and no silent data loss.

This monorepo holds the two reference implementations, published under the same package name `weimo-wdf`:

| Directory | Package | Registry | Notes |
| --- | --- | --- | --- |
| [`weimo-wdf-rs/`](weimo-wdf-rs) | `weimo-wdf` (crate) | [crates.io](https://crates.io/crates/weimo-wdf) | Rust 1.88+, adds terminal plain/ANSI rendering · [docs.rs](https://docs.rs/weimo-wdf) |
| [`weimo-wdf-ts/`](weimo-wdf-ts) | `weimo-wdf` (npm) | [npm](https://www.npmjs.com/package/weimo-wdf) | ESM + TypeScript types, zero-dependency main entry · [live demo](https://jiaowenjun.github.io/weimo-wdf/) |

v0.1 models an intentionally tiny node subset: paragraphs, ATX headings (level 1–6), blockquotes, bullet and ordered lists, and `bold` as the only inline mark. Everything outside the subset is rejected with structured, machine-readable diagnostics (`wdf.*`, `markdown.*`, `prosemirror.*`, `apple.*` codes with JSON paths) — never silently dropped or mangled.

Each implementation carries its own README, conformance fixtures, format reference, and JSON Schema (`schema/wdf-v0.1.schema.json`). The *format* is named WDF (`weimo.document`); both *packages* are named `weimo-wdf`. Release tags are prefixed per package: `rs-vX.Y.Z` and `ts-vX.Y.Z`. Contributor and release rules live in the per-project `AGENTS.md` files.

## License

MIT.
