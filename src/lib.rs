//! `weimo-wdf` implements **WDF**, the Weimo Document Format: a small,
//! strict, canonical model for rich-text documents, plus adapters that convert
//! between the formats editors actually speak.
//!
//! # What it does
//!
//! Every conversion goes through one canonical in-memory model
//! ([`WdfDocument`]). Adapters never convert formats into each other directly,
//! which keeps N formats at N adapters instead of N×N bridges:
//!
//! | Format | Direction | API |
//! | --- | --- | --- |
//! | WDF JSON (`weimo.document`) | in/out | [`validate_and_canonicalize`], [`WdfDocument`] (serde) |
//! | Markdown | in/out | [`from_markdown`], [`to_markdown`] |
//! | Tiptap / ProseMirror JSON | in/out | [`from_tiptap`], [`to_tiptap`] |
//! | Apple document JSON | in/out | [`from_apple`], [`to_apple`] |
//! | Terminal text | out | [`render_plain`], [`render_ansi`] |
//!
//! A side-by-side reference of every supported concept across the four
//! formats — including structural divergences, canonicalization edges and
//! per-format strictness — is maintained in `docs/format-reference.md` in the
//! crate repository.
//!
//! # The v0.1 subset
//!
//! WDF is intentionally tiny. v0.1 covers paragraphs, ATX headings (level
//! 1–6), blockquotes, bullet and ordered lists, and `bold` as the only inline
//! mark. Tables, links, images, inline code, nested lists and other marks are
//! **not** modeled — on input they are rejected with structured diagnostics
//! instead of being silently dropped or mangled.
//!
//! # Strictness by design
//!
//! Unknown nodes, unknown marks, unknown properties, empty lists and invalid
//! heading levels are hard errors. Every failure is returned as a
//! [`Diagnostic`] with a stable machine-readable `code` (for example
//! `wdf.unsupported_mark`, `markdown.unsupported_code`), a `source` naming the
//! adapter, and an optional JSON `path` — ready to surface as an HTTP 422 body
//! or an editor squiggle.
//!
//! # Examples
//!
//! Convert Markdown into Tiptap JSON for a web editor:
//!
//! ```
//! use weimo_wdf::{from_markdown, to_tiptap};
//!
//! let doc = from_markdown("# Release notes\n\n- **bold** item\n")
//!     .expect("supported markdown");
//! let tiptap = to_tiptap(&doc);
//! assert_eq!(tiptap["content"][0]["type"], "heading");
//! assert_eq!(tiptap["content"][1]["type"], "bulletList");
//! ```
//!
//! Validate untrusted WDF JSON and inspect the diagnostics:
//!
//! ```
//! use serde_json::json;
//! use weimo_wdf::validate_and_canonicalize;
//!
//! let input = json!({
//!     "schema": "weimo.document",
//!     "version": 1,
//!     "root": { "type": "doc", "content": [
//!         { "type": "paragraph", "content": [
//!             { "type": "text", "text": "hi", "marks": [{"type": "italic"}] }
//!         ]}
//!     ]}
//! });
//! let diagnostics = validate_and_canonicalize(&input).unwrap_err();
//! assert!(diagnostics.iter().any(|d| d.code == "wdf.unsupported_mark"));
//! ```
//!
//! Accepted input is also *canonicalized*: `\r\n` becomes `\n`, empty text
//! runs are dropped, adjacent runs with the same marks are merged, and ordered
//! lists always carry an explicit `start`. The returned [`WdfDocument`] is
//! serde-serializable, so `serde_json::to_value(&doc)` gives you canonical WDF
//! JSON directly.

pub mod adapters;
pub mod cli;
pub mod diagnostic;
pub mod model;
pub mod validate;

pub use adapters::apple::{
    AppleWireBlock, AppleWireDocument, AppleWireParagraph, AppleWireRun, from_apple, to_apple,
};
pub use adapters::markdown::{from_markdown, to_markdown};
pub use adapters::tiptap::{from_tiptap, to_tiptap};
pub use cli::{render_ansi, render_plain};
pub use diagnostic::{Diagnostic, Diagnostics};
pub use model::*;
pub use validate::validate_and_canonicalize;
