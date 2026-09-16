use crate::{
    diagnostic::{Diagnostic, Diagnostics},
    model::*,
};

/// Validates WDF JSON and returns the canonical [`WdfDocument`].
///
/// This is the only supported entry point for untrusted WDF input. It checks
/// the `schema`/`version` envelope, rejects unknown properties, nodes, marks
/// and structurally invalid content (empty documents/lists, heading levels
/// outside 1–6, list items that are not exactly one paragraph), and then
/// canonicalizes:
///
/// - `\r\n` and `\r` newlines become `\n`;
/// - empty text runs are dropped;
/// - adjacent runs with equal marks are merged;
/// - ordered lists get an explicit `attrs: {"start": 1}` when omitted.
///
/// Every violation is returned as a [`Diagnostic`] in the [`Diagnostics`]
/// list — never as a panic.
///
/// ```
/// use serde_json::json;
/// use weimo_doc::validate_and_canonicalize;
///
/// let input = json!({
///     "schema": "weimo.document",
///     "version": 1,
///     "root": { "type": "doc", "content": [
///         { "type": "paragraph", "content": [
///             { "type": "text", "text": "hello" }
///         ]}
///     ]}
/// });
/// let doc = validate_and_canonicalize(&input).expect("valid WDF");
/// assert_eq!(doc.root.content.len(), 1);
/// ```
pub fn validate_and_canonicalize(value: &serde_json::Value) -> Result<WdfDocument, Diagnostics> {
    let mut diagnostics = Vec::new();
    reject_unknown_properties(value, &mut diagnostics, &[]);
    let document = match serde_json::from_value::<WdfDocument>(value.clone()) {
        Ok(document) => document,
        Err(error) => {
            diagnostics.push(Diagnostic::error(
                "wdf",
                "wdf.invalid_document",
                error.to_string(),
            ));
            return Err(diagnostics);
        }
    };
    if document.schema != WDF_SCHEMA {
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.invalid_schema",
            "schema must be weimo.document",
        ));
    }
    if document.version != WDF_VERSION {
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.invalid_version",
            "version must be 1",
        ));
    }
    if document.root.node_type != "doc" {
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.invalid_root",
            "root type must be doc",
        ));
    }
    if document.root.content.is_empty() {
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.empty_document",
            "document must contain at least one block",
        ));
    }
    validate_blocks(&document.root.content, &mut diagnostics);
    if diagnostics.is_empty() {
        Ok(canonicalize(document))
    } else {
        Err(diagnostics)
    }
}

fn reject_unknown_properties(
    value: &serde_json::Value,
    diagnostics: &mut Diagnostics,
    path: &[serde_json::Value],
) {
    let Some(object) = value.as_object() else {
        return;
    };
    let is_mark_object = path.len() >= 2 && path[path.len() - 2].as_str() == Some("marks");
    let allowed: &[&str] = if is_mark_object {
        &["type"]
    } else {
        match path.last().and_then(serde_json::Value::as_str) {
            Some("root") => &["type", "content"],
            Some("attrs") => &["level", "start"],
            Some("marks") => &["type"],
            _ => match object.get("type").and_then(serde_json::Value::as_str) {
                Some("paragraph") | Some("list_item") => &["type", "content"],
                Some("heading") => &["type", "attrs", "content"],
                Some("blockquote") | Some("bullet_list") => &["type", "content"],
                Some("ordered_list") => &["type", "attrs", "content"],
                Some("text") => &["type", "text", "marks"],
                Some("doc") => &["type", "content"],
                Some("bold") => &["type"],
                _ => &["schema", "version", "root"],
            },
        }
    };
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            diagnostics.push(
                Diagnostic::error(
                    "wdf",
                    "wdf.unknown_property",
                    format!("unknown property {key}"),
                )
                .at(path
                    .iter()
                    .cloned()
                    .chain(std::iter::once(key.clone().into()))
                    .collect()),
            );
        }
    }
    for (key, child) in object {
        let mut child_path = path.to_vec();
        child_path.push(key.clone().into());
        match key.as_str() {
            "root" | "attrs" | "marks" => {
                reject_unknown_properties(child, diagnostics, &child_path)
            }
            "content" => {
                if let Some(array) = child.as_array() {
                    for (index, item) in array.iter().enumerate() {
                        let mut item_path = child_path.clone();
                        item_path.push(index.into());
                        reject_unknown_properties(item, diagnostics, &item_path);
                    }
                }
            }
            _ => {}
        }
    }
}

fn validate_blocks(blocks: &[WdfBlock], diagnostics: &mut Diagnostics) {
    for (index, block) in blocks.iter().enumerate() {
        match block {
            WdfBlock::Paragraph { content } => validate_inline(
                content,
                diagnostics,
                vec!["root".into(), "content".into(), index.into()],
            ),
            WdfBlock::Heading { attrs, content } => {
                if !(1..=6).contains(&attrs.level) {
                    diagnostics.push(
                        Diagnostic::error(
                            "wdf",
                            "wdf.invalid_heading_level",
                            "heading level must be between 1 and 6",
                        )
                        .at(vec![
                            "root".into(),
                            "content".into(),
                            index.into(),
                            "attrs".into(),
                            "level".into(),
                        ]),
                    );
                }
                validate_inline(
                    content,
                    diagnostics,
                    vec!["root".into(), "content".into(), index.into()],
                );
            }
            WdfBlock::Blockquote { content } => {
                if content.is_empty() {
                    diagnostics.push(Diagnostic::error(
                        "wdf",
                        "wdf.invalid_blockquote",
                        "blockquote must contain a paragraph",
                    ));
                }
                for paragraph in content {
                    validate_paragraph(paragraph, diagnostics);
                }
            }
            WdfBlock::BulletList { content } => validate_list(content, None, diagnostics),
            WdfBlock::OrderedList { attrs, content } => {
                validate_list(content, attrs.as_ref().map(|a| a.start), diagnostics)
            }
        }
    }
}

fn validate_paragraph(paragraph: &WdfParagraph, diagnostics: &mut Diagnostics) {
    if paragraph.node_type != "paragraph" {
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.invalid_paragraph",
            "paragraph type must be paragraph",
        ));
    }
    validate_inline(&paragraph.content, diagnostics, vec![]);
}

fn validate_list(items: &[WdfListItem], start: Option<u32>, diagnostics: &mut Diagnostics) {
    if items.is_empty() {
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.empty_list",
            "list must contain at least one list item",
        ));
    }
    if let Some(start) = start.filter(|value| *value == 0) {
        let _ = start;
        diagnostics.push(Diagnostic::error(
            "wdf",
            "wdf.invalid_list_start",
            "ordered list start must be at least 1",
        ));
    }
    for item in items {
        if item.node_type != "list_item" || item.content.len() != 1 {
            diagnostics.push(Diagnostic::error(
                "wdf",
                "wdf.invalid_list_item",
                "list item must contain exactly one paragraph",
            ));
            continue;
        }
        validate_paragraph(&item.content[0], diagnostics);
    }
}

fn validate_inline(
    content: &[WdfText],
    diagnostics: &mut Diagnostics,
    _path: Vec<serde_json::Value>,
) {
    for text in content {
        if text.node_type != "text" {
            diagnostics.push(Diagnostic::error(
                "wdf",
                "wdf.invalid_text_node",
                "inline node type must be text",
            ));
        }
        if let Some(marks) = &text.marks {
            if marks.len() > 1 || marks.iter().any(|mark| mark.mark_type != "bold") {
                diagnostics.push(Diagnostic::error(
                    "wdf",
                    "wdf.unsupported_mark",
                    "only one bold mark is supported",
                ));
            }
        }
    }
}

fn canonicalize(mut document: WdfDocument) -> WdfDocument {
    document.schema = WDF_SCHEMA.to_string();
    document.version = WDF_VERSION;
    document.root.node_type = "doc".to_string();
    document.root.content = document
        .root
        .content
        .into_iter()
        .map(canonical_block)
        .collect();
    document
}

fn canonical_block(block: WdfBlock) -> WdfBlock {
    match block {
        WdfBlock::Paragraph { content } => WdfBlock::Paragraph {
            content: canonical_inline(content),
        },
        WdfBlock::Heading { attrs, content } => WdfBlock::Heading {
            attrs,
            content: canonical_inline(content),
        },
        WdfBlock::Blockquote { content } => WdfBlock::Blockquote {
            content: content.into_iter().map(canonical_paragraph).collect(),
        },
        WdfBlock::BulletList { content } => WdfBlock::BulletList {
            content: content.into_iter().map(canonical_item).collect(),
        },
        WdfBlock::OrderedList { attrs, content } => WdfBlock::OrderedList {
            attrs: Some(OrderedListAttrs {
                start: attrs.map_or(1, |a| a.start),
            }),
            content: content.into_iter().map(canonical_item).collect(),
        },
    }
}

fn canonical_paragraph(paragraph: WdfParagraph) -> WdfParagraph {
    WdfParagraph {
        node_type: "paragraph".to_string(),
        content: canonical_inline(paragraph.content),
    }
}
fn canonical_item(item: WdfListItem) -> WdfListItem {
    WdfListItem {
        node_type: "list_item".to_string(),
        content: vec![canonical_paragraph(
            item.content
                .into_iter()
                .next()
                .unwrap_or_else(|| paragraph(vec![])),
        )],
    }
}

fn canonical_inline(content: Vec<WdfText>) -> Vec<WdfText> {
    let mut result: Vec<WdfText> = Vec::new();
    for mut text in content {
        text.text = text.text.replace("\r\n", "\n").replace('\r', "\n");
        if text.text.is_empty() {
            continue;
        }
        text.node_type = "text".to_string();
        if text.is_bold() {
            text.marks = Some(vec![WdfMark {
                mark_type: "bold".to_string(),
            }]);
        } else {
            text.marks = None;
        }
        if let Some(previous) = result.last_mut() {
            if previous.is_bold() == text.is_bold() {
                previous.text.push_str(&text.text);
                continue;
            }
        }
        result.push(text);
    }
    result
}
