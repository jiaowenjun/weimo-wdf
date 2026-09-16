use serde::{Deserialize, Serialize};

/// Value of the `schema` field in every WDF v0.1 document: `"weimo.document"`.
pub const WDF_SCHEMA: &str = "weimo.document";

/// Value of the `version` field in every WDF v0.1 document.
pub const WDF_VERSION: u32 = 1;

/// The canonical WDF document.
///
/// This is the model every adapter converts into and out of. It serializes to
/// (and deserializes from) WDF JSON, so `serde_json::to_value(&doc)` produces
/// canonical WDF JSON ready to store or send over the wire.
///
/// Documents received from the outside world should go through
/// [`crate::validate_and_canonicalize`] rather than plain deserialization:
/// deserialization alone accepts structurally valid but semantically invalid
/// documents (unknown marks, empty lists, heading level 0, …) and skips
/// canonicalization.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WdfDocument {
    /// Always [`WDF_SCHEMA`] after canonicalization.
    pub schema: String,
    /// Always [`WDF_VERSION`] after canonicalization.
    pub version: u32,
    /// The document root; `node_type` is `"doc"`.
    pub root: WdfRoot,
}

/// The root node of a [`WdfDocument`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WdfRoot {
    /// Node type string; `"doc"` in canonical documents.
    #[serde(rename = "type")]
    pub node_type: String,
    /// One or more block nodes. An empty document is invalid.
    pub content: Vec<WdfBlock>,
}

/// A block-level node.
///
/// Serializes with the `"type"` tag used in WDF JSON, e.g.
/// `{"type": "heading", "attrs": {"level": 2}, "content": [...]}`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WdfBlock {
    /// A paragraph of inline [`WdfText`] runs.
    #[serde(rename = "paragraph")]
    Paragraph { content: Vec<WdfText> },
    /// An ATX heading, level 1–6.
    #[serde(rename = "heading")]
    Heading {
        attrs: HeadingAttrs,
        content: Vec<WdfText>,
    },
    /// A quotation holding one or more paragraphs.
    #[serde(rename = "blockquote")]
    Blockquote { content: Vec<WdfParagraph> },
    /// An unordered list; every item holds exactly one paragraph.
    #[serde(rename = "bullet_list")]
    BulletList { content: Vec<WdfListItem> },
    /// An ordered list; every item holds exactly one paragraph. Canonical
    /// documents always carry `attrs.start` (defaulting to 1).
    #[serde(rename = "ordered_list")]
    OrderedList {
        #[serde(default)]
        attrs: Option<OrderedListAttrs>,
        content: Vec<WdfListItem>,
    },
}

/// Heading attributes: the ATX level, 1–6.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeadingAttrs {
    pub level: u8,
}

/// Ordered-list attributes: the first item number, at least 1.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrderedListAttrs {
    pub start: u32,
}

/// A paragraph, either at the top level or inside a blockquote/list item.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WdfParagraph {
    /// Node type string; `"paragraph"` in canonical documents.
    #[serde(rename = "type")]
    pub node_type: String,
    pub content: Vec<WdfText>,
}

/// A list item; canonical items contain exactly one paragraph.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WdfListItem {
    /// Node type string; `"list_item"` in canonical documents.
    #[serde(rename = "type")]
    pub node_type: String,
    pub content: Vec<WdfParagraph>,
}

/// An inline text run. `bold` is the only supported mark in v0.1.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WdfText {
    /// Node type string; `"text"` in canonical documents.
    #[serde(rename = "type")]
    pub node_type: String,
    pub text: String,
    /// Present only when non-empty; at most one `bold` mark.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marks: Option<Vec<WdfMark>>,
}

/// An inline mark. `"bold"` is the only valid `mark_type` in v0.1.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WdfMark {
    #[serde(rename = "type")]
    pub mark_type: String,
}

impl WdfDocument {
    /// An empty document: one empty paragraph, valid out of the box.
    pub fn empty() -> Self {
        Self {
            schema: WDF_SCHEMA.to_string(),
            version: WDF_VERSION,
            root: WdfRoot {
                node_type: "doc".to_string(),
                content: vec![WdfBlock::Paragraph { content: vec![] }],
            },
        }
    }
}

impl WdfText {
    /// A run without marks.
    pub fn plain(text: impl Into<String>) -> Self {
        Self {
            node_type: "text".to_string(),
            text: text.into(),
            marks: None,
        }
    }

    /// A run carrying a single `bold` mark.
    pub fn bold(text: impl Into<String>) -> Self {
        Self {
            node_type: "text".to_string(),
            text: text.into(),
            marks: Some(vec![WdfMark {
                mark_type: "bold".to_string(),
            }]),
        }
    }

    /// Whether this run carries a `bold` mark.
    pub fn is_bold(&self) -> bool {
        self.marks
            .as_ref()
            .is_some_and(|marks| marks.iter().any(|mark| mark.mark_type == "bold"))
    }
}

/// Builds a paragraph from inline runs: `paragraph(vec![WdfText::plain("hi")])`.
pub fn paragraph(content: Vec<WdfText>) -> WdfParagraph {
    WdfParagraph {
        node_type: "paragraph".to_string(),
        content,
    }
}

/// Builds a list item whose single paragraph wraps the given inline runs.
pub fn list_item(content: Vec<WdfText>) -> WdfListItem {
    WdfListItem {
        node_type: "list_item".to_string(),
        content: vec![paragraph(content)],
    }
}
