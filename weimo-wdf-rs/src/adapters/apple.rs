use crate::{
    diagnostic::{Diagnostic, Diagnostics},
    model::*,
    validate::validate_and_canonicalize,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The wire envelope of an Apple document: `{"type":"apple.document","version":1,"blocks":[...]}`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AppleWireDocument {
    #[serde(rename = "type")]
    pub wire_type: String,
    pub version: u32,
    pub blocks: Vec<AppleWireBlock>,
}

/// One styled text run in an Apple document: plain `text` plus an optional
/// `bold: true`. Presentation-only attributes are never carried in the wire
/// format.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AppleWireRun {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
}

/// A group of runs used inside blockquotes and list items.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AppleWireParagraph {
    pub runs: Vec<AppleWireRun>,
}

/// A block of an Apple document, tagged by `type`:
/// `paragraph`, `heading` (with `level`), `blockquote`, `bullet_list`,
/// `ordered_list` (with `start`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AppleWireBlock {
    #[serde(rename = "paragraph")]
    Paragraph { runs: Vec<AppleWireRun> },
    #[serde(rename = "heading")]
    Heading { level: u8, runs: Vec<AppleWireRun> },
    #[serde(rename = "blockquote")]
    Blockquote { paragraphs: Vec<AppleWireParagraph> },
    #[serde(rename = "bullet_list")]
    BulletList { items: Vec<AppleWireParagraph> },
    #[serde(rename = "ordered_list")]
    OrderedList {
        start: u32,
        items: Vec<AppleWireParagraph>,
    },
}

/// Parses Apple document JSON into a canonical [`WdfDocument`].
///
/// Expects the envelope `{"type":"apple.document","version":1,"blocks":[...]}`
/// with blocks carrying `runs` instead of inline text nodes. Unknown shapes
/// are rejected with `apple.*` diagnostics.
///
/// ```
/// use serde_json::json;
/// use weimo_wdf::from_apple;
///
/// let value = json!({
///     "type": "apple.document",
///     "version": 1,
///     "blocks": [{ "type": "paragraph", "runs": [{"text": "hello"}] }]
/// });
/// let doc = from_apple(&value).expect("supported apple document");
/// assert_eq!(doc.root.content.len(), 1);
/// ```
pub fn from_apple(value: &Value) -> Result<WdfDocument, Diagnostics> {
    let wire = serde_json::from_value::<AppleWireDocument>(value.clone()).map_err(|error| {
        vec![Diagnostic::error(
            "apple",
            "apple.invalid_document",
            error.to_string(),
        )]
    })?;
    if wire.wire_type != "apple.document" || wire.version != 1 {
        return Err(vec![Diagnostic::error(
            "apple",
            "apple.invalid_document",
            "type must be apple.document and version must be 1",
        )]);
    }
    let blocks = wire
        .blocks
        .into_iter()
        .map(|block| match block {
            AppleWireBlock::Paragraph { runs } => WdfBlock::Paragraph {
                content: runs_to_wdf(runs),
            },
            AppleWireBlock::Heading { level, runs } => WdfBlock::Heading {
                attrs: HeadingAttrs { level },
                content: runs_to_wdf(runs),
            },
            AppleWireBlock::Blockquote { paragraphs } => WdfBlock::Blockquote {
                content: paragraphs
                    .into_iter()
                    .map(|p| paragraph(runs_to_wdf(p.runs)))
                    .collect(),
            },
            AppleWireBlock::BulletList { items } => WdfBlock::BulletList {
                content: items
                    .into_iter()
                    .map(|p| list_item(runs_to_wdf(p.runs)))
                    .collect(),
            },
            AppleWireBlock::OrderedList { start, items } => WdfBlock::OrderedList {
                attrs: Some(OrderedListAttrs { start }),
                content: items
                    .into_iter()
                    .map(|p| list_item(runs_to_wdf(p.runs)))
                    .collect(),
            },
        })
        .collect::<Vec<_>>();
    validate_and_canonicalize(
        &serde_json::to_value(WdfDocument {
            schema: WDF_SCHEMA.to_string(),
            version: WDF_VERSION,
            root: WdfRoot {
                node_type: "doc".to_string(),
                content: blocks,
            },
        })
        .expect("WDF serialization"),
    )
}

fn runs_to_wdf(runs: Vec<AppleWireRun>) -> Vec<WdfText> {
    runs.into_iter()
        .map(|run| {
            if run.bold == Some(true) {
                WdfText::bold(run.text)
            } else {
                WdfText::plain(run.text)
            }
        })
        .collect()
}
fn runs(content: &[WdfText]) -> Vec<AppleWireRun> {
    content
        .iter()
        .filter(|text| !text.text.is_empty())
        .map(|text| AppleWireRun {
            text: text.text.clone(),
            bold: text.is_bold().then_some(true),
        })
        .collect()
}

/// Renders a [`WdfDocument`] as Apple document JSON.
///
/// Inverse of [`from_apple`]: text becomes `runs` with an optional `bold`,
/// headings carry `level`, ordered lists carry `start`.
pub fn to_apple(document: &WdfDocument) -> Value {
    let wire = AppleWireDocument {
        wire_type: "apple.document".to_string(),
        version: 1,
        blocks: document
            .root
            .content
            .iter()
            .map(|block| match block {
                WdfBlock::Paragraph { content } => AppleWireBlock::Paragraph {
                    runs: runs(content),
                },
                WdfBlock::Heading { attrs, content } => AppleWireBlock::Heading {
                    level: attrs.level,
                    runs: runs(content),
                },
                WdfBlock::Blockquote { content } => AppleWireBlock::Blockquote {
                    paragraphs: content
                        .iter()
                        .map(|p| AppleWireParagraph {
                            runs: runs(&p.content),
                        })
                        .collect(),
                },
                WdfBlock::BulletList { content } => AppleWireBlock::BulletList {
                    items: content
                        .iter()
                        .map(|i| AppleWireParagraph {
                            runs: runs(&i.content[0].content),
                        })
                        .collect(),
                },
                WdfBlock::OrderedList { attrs, content } => AppleWireBlock::OrderedList {
                    start: attrs.as_ref().map_or(1, |a| a.start),
                    items: content
                        .iter()
                        .map(|i| AppleWireParagraph {
                            runs: runs(&i.content[0].content),
                        })
                        .collect(),
                },
            })
            .collect(),
    };
    serde_json::to_value(wire).expect("Apple wire serialization")
}
