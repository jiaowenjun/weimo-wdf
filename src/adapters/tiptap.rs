use crate::{
    diagnostic::{Diagnostic, Diagnostics},
    model::*,
    validate::validate_and_canonicalize,
};
use serde_json::{Value, json};

/// Parses Tiptap/ProseMirror editor JSON into a canonical [`WdfDocument`].
///
/// Node names use ProseMirror camelCase: `doc`, `paragraph`, `heading`,
/// `blockquote`, `bulletList`, `orderedList` (with `attrs.start`), `listItem`
/// and `text` nodes with the `bold` mark. Unknown node types, non-text inline
/// nodes and marks other than a single `bold` are rejected with
/// `prosemirror.*` diagnostics.
///
/// ```
/// use serde_json::json;
/// use weimo_wdf::from_tiptap;
///
/// let value = json!({
///     "type": "doc",
///     "content": [{ "type": "paragraph", "content": [
///         { "type": "text", "text": "hello" }
///     ]}]
/// });
/// let doc = from_tiptap(&value).expect("supported tiptap document");
/// assert_eq!(doc.root.content.len(), 1);
/// ```
pub fn from_tiptap(value: &Value) -> Result<WdfDocument, Diagnostics> {
    let mut diagnostics = Vec::new();
    let Some(root) = value.as_object() else {
        return Err(vec![Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            "document must be an object",
        )]);
    };
    if root.get("type").and_then(Value::as_str) != Some("doc") {
        return Err(vec![Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            "root type must be doc",
        )]);
    }
    let Some(content) = root.get("content").and_then(Value::as_array) else {
        return Err(vec![Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            "doc content must be an array",
        )]);
    };
    let blocks = content
        .iter()
        .enumerate()
        .filter_map(|(index, block)| parse_block(block, index, &mut diagnostics))
        .collect::<Vec<_>>();
    if diagnostics.is_empty() {
        validate_and_canonicalize(
            &json!({"schema":WDF_SCHEMA,"version":WDF_VERSION,"root":{"type":"doc","content":blocks}}),
        )
    } else {
        Err(diagnostics)
    }
}

fn parse_block(value: &Value, index: usize, diagnostics: &mut Diagnostics) -> Option<WdfBlock> {
    let Some(object) = value.as_object() else {
        diagnostics.push(Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            format!("block {index} must be an object"),
        ));
        return None;
    };
    let block_type = object.get("type").and_then(Value::as_str).unwrap_or("");
    let content = object
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    match block_type {
        "paragraph" => Some(WdfBlock::Paragraph {
            content: parse_inline(&content, diagnostics),
        }),
        "heading" => Some(WdfBlock::Heading {
            attrs: HeadingAttrs {
                level: object
                    .get("attrs")
                    .and_then(|attrs| attrs.get("level"))
                    .and_then(Value::as_u64)
                    .unwrap_or(1) as u8,
            },
            content: parse_inline(&content, diagnostics),
        }),
        "blockquote" => Some(WdfBlock::Blockquote {
            content: content
                .iter()
                .filter_map(|item| parse_paragraph(item, diagnostics))
                .collect(),
        }),
        "bulletList" => Some(WdfBlock::BulletList {
            content: content
                .iter()
                .filter_map(|item| parse_item(item, diagnostics))
                .collect(),
        }),
        "orderedList" => Some(WdfBlock::OrderedList {
            attrs: Some(OrderedListAttrs {
                start: object
                    .get("attrs")
                    .and_then(|attrs| attrs.get("start"))
                    .and_then(Value::as_u64)
                    .unwrap_or(1) as u32,
            }),
            content: content
                .iter()
                .filter_map(|item| parse_item(item, diagnostics))
                .collect(),
        }),
        _ => {
            diagnostics.push(Diagnostic::error(
                "prosemirror",
                "prosemirror.unsupported_node",
                format!("unsupported node type {block_type}"),
            ));
            None
        }
    }
}

fn parse_paragraph(value: &Value, diagnostics: &mut Diagnostics) -> Option<WdfParagraph> {
    if value.get("type").and_then(Value::as_str) != Some("paragraph") {
        diagnostics.push(Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            "list and quote children must be paragraphs",
        ));
        return None;
    }
    Some(paragraph(parse_inline(
        value
            .get("content")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]),
        diagnostics,
    )))
}

fn parse_item(value: &Value, diagnostics: &mut Diagnostics) -> Option<WdfListItem> {
    if value.get("type").and_then(Value::as_str) != Some("listItem") {
        diagnostics.push(Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            "list children must be listItem",
        ));
        return None;
    }
    let content = value
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if content.len() != 1 {
        diagnostics.push(Diagnostic::error(
            "prosemirror",
            "prosemirror.invalid_document",
            "listItem must contain one paragraph",
        ));
        return None;
    }
    parse_paragraph(&content[0], diagnostics).map(|paragraph| WdfListItem {
        node_type: "list_item".to_string(),
        content: vec![paragraph],
    })
}

fn parse_inline(content: &[Value], diagnostics: &mut Diagnostics) -> Vec<WdfText> {
    content
        .iter()
        .filter_map(|value| {
            if value.get("type").and_then(Value::as_str) != Some("text") {
                diagnostics.push(Diagnostic::error(
                    "prosemirror",
                    "prosemirror.unsupported_node",
                    "inline nodes must be text",
                ));
                return None;
            }
            let text = value.get("text").and_then(Value::as_str).unwrap_or("");
            let marks = value.get("marks").and_then(Value::as_array);
            if let Some(marks) = marks {
                if marks
                    .iter()
                    .any(|mark| mark.get("type").and_then(Value::as_str) != Some("bold"))
                {
                    diagnostics.push(Diagnostic::error(
                        "prosemirror",
                        "prosemirror.unsupported_mark",
                        "only the bold mark is supported",
                    ));
                    return None;
                }
                if marks.len() > 1 {
                    diagnostics.push(Diagnostic::error(
                        "prosemirror",
                        "prosemirror.duplicate_mark",
                        "bold may appear at most once",
                    ));
                    return None;
                }
            }
            let bold = marks.is_some_and(|marks| {
                marks
                    .iter()
                    .any(|mark| mark.get("type").and_then(Value::as_str) == Some("bold"))
            });
            Some(if bold {
                WdfText::bold(text)
            } else {
                WdfText::plain(text)
            })
        })
        .collect()
}

/// Renders a [`WdfDocument`] as Tiptap/ProseMirror JSON (`{"type":"doc",...}`).
///
/// The output uses the same node names as [`from_tiptap`] accepts, with
/// `orderedList` always carrying `attrs.start`, so it can be loaded straight
/// into a Tiptap editor or sent to a ProseMirror backend.
pub fn to_tiptap(document: &WdfDocument) -> Value {
    json!({"type":"doc","content":document.root.content.iter().map(block_to_json).collect::<Vec<_>>()})
}

fn inline(content: &[WdfText]) -> Vec<Value> {
    content
        .iter()
        .filter(|text| !text.text.is_empty())
        .map(|text| {
            if text.is_bold() {
                json!({"type":"text","text":text.text,"marks":[{"type":"bold"}]})
            } else {
                json!({"type":"text","text":text.text})
            }
        })
        .collect()
}
fn paragraph_json(paragraph: &WdfParagraph) -> Value {
    json!({"type":"paragraph","content":inline(&paragraph.content)})
}
fn item_json(item: &WdfListItem) -> Value {
    json!({"type":"listItem","content":[paragraph_json(&item.content[0])]})
}
fn block_to_json(block: &WdfBlock) -> Value {
    match block {
        WdfBlock::Paragraph { content } => json!({"type":"paragraph","content":inline(content)}),
        WdfBlock::Heading { attrs, content } => {
            json!({"type":"heading","attrs":{"level":attrs.level},"content":inline(content)})
        }
        WdfBlock::Blockquote { content } => {
            json!({"type":"blockquote","content":content.iter().map(paragraph_json).collect::<Vec<_>>() })
        }
        WdfBlock::BulletList { content } => {
            json!({"type":"bulletList","content":content.iter().map(item_json).collect::<Vec<_>>() })
        }
        WdfBlock::OrderedList { attrs, content } => {
            json!({"type":"orderedList","attrs":{"start":attrs.as_ref().map_or(1, |a| a.start)},"content":content.iter().map(item_json).collect::<Vec<_>>() })
        }
    }
}
