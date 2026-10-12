# Format reference

`weimo-wdf` keeps one canonical model ([`WdfDocument`]) and converts it to and from four wire formats. This document maps every supported concept across the formats, records where their underlying structures genuinely diverge, and spells out the canonicalization, round-trip and strictness rules. The validator (`validateAndCanonicalize`) is the semantic authority; this document describes what it guarantees.

All examples in this document are mechanical outputs of the package, not hand-written approximations. JSON object key order is never significant (serialization may sort keys); the shapes below use conventional key order for readability.

## The same document, four ways

A heading with a bold run, and an ordered list starting at 3:

**Markdown**

````text
## Release **notes**

3. third
4. fourth
````

**WDF JSON** (canonical)

```json
{"schema":"weimo.document","version":1,"root":{"type":"doc","content":[
  {"type":"heading","attrs":{"level":2},"content":[
    {"type":"text","text":"Release "},
    {"type":"text","text":"notes","marks":[{"type":"bold"}]}]},
  {"type":"ordered_list","attrs":{"start":3},"content":[
    {"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"third"}]}]},
    {"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"fourth"}]}]}]}]}}
```

**Tiptap / ProseMirror JSON**

```json
{"type":"doc","content":[
  {"type":"heading","attrs":{"level":2},"content":[
    {"type":"text","text":"Release "},
    {"type":"text","text":"notes","marks":[{"type":"bold"}]}]},
  {"type":"orderedList","attrs":{"start":3},"content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"third"}]}]},
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"fourth"}]}]}]}]}
```

**Apple document JSON**

```json
{"type":"apple.document","version":1,"blocks":[
  {"type":"heading","level":2,"runs":[
    {"text":"Release "},
    {"text":"notes","bold":true}]},
  {"type":"ordered_list","start":3,"items":[
    {"runs":[{"text":"third"}]},
    {"runs":[{"text":"fourth"}]}]}]}
```

## Envelope and versioning

| | Envelope | Versioning |
| --- | --- | --- |
| WDF JSON | `schema` + `version` + `root` | pinned: `"weimo.document"`, `1` — anything else is rejected |
| Tiptap JSON | `{"type":"doc"}` only | none on the wire; the schema lives in the editor configuration |
| Apple JSON | `type` + `version` + `blocks` | pinned: `"apple.document"`, `1` |
| Markdown | none — plain text | none; the dialect is "the supported subset" defined by this package |

## Node mapping

| Concept | WDF JSON | Tiptap JSON | Apple JSON | Markdown |
| --- | --- | --- | --- | --- |
| Paragraph | `{"type":"paragraph","content":[runs]}` | same, camelCase n/a | `{"type":"paragraph","runs":[…]}` | bare text lines |
| Heading (1–6) | `{"type":"heading","attrs":{"level":N},"content":[runs]}` | same shape | `{"type":"heading","level":N,"runs":[…]}` — bare `level` | `#` … `######` prefix |
| Blockquote | `content: [paragraphs]` | `content: [paragraph]` | `{"type":"blockquote","paragraphs":[{"runs":[…]}]}` | `> ` prefix per line |
| Bullet list | `{"type":"bullet_list","content":[list_item]}` | `bulletList` → `listItem` | `{"type":"bullet_list","items":[{"runs":[…]}]}` | `- ` prefix |
| Ordered list | `{"type":"ordered_list","attrs":{"start":N},"content":[list_item]}` | `orderedList` + `attrs.start` | `{"type":"ordered_list","start":N,"items":[…]}` — bare `start` | `N.` `N+1.` … prefixes |
| List item | `{"type":"list_item","content":[one paragraph]}` | `listItem` wrapping a `paragraph` | no node — an item *is* a run group | one line |
| Text run | `{"type":"text","text":s}` + optional `marks` | identical to WDF | `{"text":s}` — no node wrapper | raw text |
| Bold | `marks: [{"type":"bold"}]` | identical to WDF | `"bold": true` on the run | `**…**` (inner `**` escaped as `\**`) |

WDF and Tiptap share the exact inline representation — a text node is a typed node carrying a `marks` array. Apple has no inline node layer at all: a run is a bare object with `text` plus an optional boolean. Markdown has no structure at this level, only lexical sigils.

## Structural divergences

Four design differences explain every mapping above:

1. **Type naming.** WDF and Apple use `snake_case` (`bullet_list`); Tiptap/ProseMirror uses `camelCase` (`bulletList`); Markdown has sigils instead of names.
2. **Attribute placement.** WDF and Tiptap nest attributes in an `attrs` object (`{"attrs":{"level":2}}`); Apple hoists them to bare fields on the block (`"level":2`, `"start":3`).
3. **Inline model.** WDF/Tiptap: typed text nodes + `marks` array. Apple: plain runs + `"bold": true`. Markdown: inline sigils. Only WDF/Tiptap can represent a mark as data without interpreting it.
4. **Container shape.** WDF and Tiptap keep a `list_item` node that must contain exactly one `paragraph` node. Apple removes both layers: list items are run groups directly (`items: [{"runs":[…]}]`), and blockquotes name their children `paragraphs`. Markdown flattens everything to line prefixes.

## Newlines and line breaks

- In WDF, Tiptap and Apple JSON, `"\n"` inside a text run is ordinary data and survives those three formats' round trips unchanged.
- In Markdown, a soft or hard line break becomes a `"\n"` text run inside the *same* paragraph (and inside the same list item), so paragraphs round-trip.
- Inside a **blockquote**, every source line becomes its own paragraph — a quote cannot hold a newline inside a single paragraph. A `"\n"` inside a blockquote paragraph's text run therefore converts to a paragraph boundary on the Markdown side (the structured formats keep it as one paragraph).
- Canonicalization normalizes `\r\n` and `\r` to `\n` on every input path.

## Canonicalization and equivalence

`validateAndCanonicalize` — and therefore every `from*` adapter, since they all funnel through it — normalizes accepted input:

- `\r\n` / `\r` → `\n`;
- empty text runs are dropped;
- adjacent runs with equal marks are merged;
- ordered lists always carry an explicit `attrs.start` (input may omit it; it defaults to 1).

Two consequences worth internalizing:

- **Loose and tight Markdown lists are the same document.** `- a\n\n- b` and `- a\n- b` both canonicalize to the same model; `toMarkdown` always emits the tight form.
- **Serialization is stable.** For any canonical `WdfDocument`:
  - `fromTiptap(toTiptap(doc)) equals doc` — always, including empty paragraphs;
  - `fromApple(toApple(doc)) equals doc` — always;
  - `fromMarkdown(toMarkdown(doc)) equals doc` — with two edges documented below.

Known Markdown edges (the model is strictly more expressive than the format):

- **Empty paragraphs cannot be expressed.** A blank line is not a paragraph, so `toMarkdown` output for an empty paragraph contains nothing re-readable; a document consisting only of empty paragraphs round-trips to `wdf.empty_document`. Empty list items (`-` alone) *are* representable and round-trip.
- **Blockquote-internal newlines** become paragraph boundaries, as described above.

## Strictness and diagnostics

Every failure is a structured `Diagnostic` (`source`, `code`, `path`, `message`). What is rejected versus ignored differs per adapter — this table is the contract:

| Input | Unknown constructs | Unknown properties | Attributes | Marks |
| --- | --- | --- | --- | --- |
| WDF JSON | non-existent node types fail deserialization → `wdf.invalid_document` | **rejected**: `wdf.unknown_property` with JSON `path` | unknown keys inside `attrs` rejected | only one `bold`; anything else → `wdf.unsupported_mark` |
| Markdown | outside the subset (code, links, images, tables, HTML, nested lists, …) → `markdown.unsupported_*` | n/a (no structure) | n/a | only `**bold**`; e.g. `*em*` → `markdown.unsupported_inline` |
| Tiptap JSON | unknown node types → `prosemirror.unsupported_node` | ignored (only known keys are read) | unknown attrs ignored; missing `heading.level` / `orderedList.start` default to 1 | non-bold → `prosemirror.unsupported_mark`; duplicate bold → `prosemirror.duplicate_mark` |
| Apple JSON | block shapes that don't deserialize → `apple.invalid_document` | ignored (deserialization skips unknown fields) | n/a (bare fields) | n/a (boolean); semantic violations surface later as `wdf.*` diagnostics — e.g. `level: 9` → `wdf.invalid_heading_level`, empty list → `wdf.empty_list`, `start: 0` → `wdf.invalid_list_start` |

In short: **WDF input is the strictest** (unknown anything is an error), while the Tiptap and Apple adapters read leniently at the structural level and defer semantic judgment to the WDF validator, so you always end up with either a fully canonical document or explicit diagnostics.

Integer attributes are range-checked at the serialization widths inherited from the original (now removed) Rust implementation: heading `level` must fit an unsigned 8-bit integer and ordered-list `start` an unsigned 32-bit integer; wider values are rejected as `wdf.invalid_document` rather than a more specific code.

One code-shape quirk to be aware of when matching on `code`: Markdown's multi-word kinds embed spaces, e.g. `markdown.unsupported_list item content`. Match with `starts_with("markdown.unsupported_")` rather than full-string equality for the family.

## Terminal rendering

`renderPlain` is an output-only view of the canonical model:

- Blocks are separated by one blank line; output ends with a single `\n`.
- Headings keep their `#` prefix; list items use `- ` / `N. `; quote lines are prefixed `> `.
- `renderPlain` emits no escape codes — safe for logs and pipes.

The WDF tooling surface also specifies an ANSI variant (bold runs wrapped in `\x1b[1m`…`\x1b[22m`, heading inline spans wrapped whole, so output can contain adjacent/nested escape pairs); the npm package does not ship it, as terminals are not a frontend scenario.

## Notes for implementers of other adapters

If you add another wire format, keep the two invariants the existing adapters follow:

1. Convert to or from the canonical model only — never format-to-format. All `from*` functions end in `validateAndCanonicalize`, so a new adapter inherits validation, canonicalization and diagnostics for free.
2. Decide strictness explicitly at the structural layer, but always let the WDF validator make the final semantic call; report your adapter's own failures with your own `source` prefix.
